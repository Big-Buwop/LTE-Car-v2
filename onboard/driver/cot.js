/**
 * cot.js — CoT position emitter for TAKServer 5.6
 * Gets GPS from gps.js module (single serial owner), sends CoT over TLS
 */

const tls = require("tls");
const fs = require("fs");
const path = require("path");
const gps = require("./gps");

let tlsSocket = null;
let config = {};
let emitInterval = null;
let reconnectTimer = null;
let connected = false;

function buildCoT(lat, lon, hae, speed, heading) {
    const now = new Date();
    const staleMs = (config.tak?.stale_seconds || 30) * 1000;
    const stale = new Date(now.getTime() + staleMs);

    const uid = config.tak?.uid || "LTE-CAR-01";
    const callsign = config.tak?.callsign || "ROVER-1";
    const cotType = config.tak?.type || "a-f-G-U-C";

    const timeStr = now.toISOString();
    const staleStr = stale.toISOString();

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0" uid="${uid}" type="${cotType}" time="${timeStr}" start="${timeStr}" stale="${staleStr}" how="m-g">
    <point lat="${lat}" lon="${lon}" hae="${hae || 0}" ce="10.0" le="5.0"/>
    <detail>
        <contact callsign="${callsign}"/>
        <__group name="Cyan" role="Team Member"/>
        <precisionlocation altsrc="GPS" geopointsrc="GPS"/>
        <track speed="${speed || 0}" course="${heading || 0}"/>
        <remarks>LTE-Car via BlackGrid private LTE</remarks>
    </detail>
</event>`;
}

function connectTAK() {
    const host = config.tak?.host || "10.10.40.101";
    const port = config.tak?.port || 8089;
    const certsDir = path.join(__dirname, "..", "certs");

    let tlsOptions;
    try {
        tlsOptions = {
            host, port,
            cert: fs.readFileSync(path.join(certsDir, "lte-car-cert.pem")),
            key: fs.readFileSync(path.join(certsDir, "lte-car-key.pem")),
            ca: fs.readFileSync(path.join(certsDir, "ca.pem")),
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined
        };
    } catch (err) {
        console.error(`[CoT] Failed to read certs from ${certsDir}: ${err.message}`);
        return;
    }

    console.log(`[CoT] Connecting to TAKServer ${host}:${port} (TLS)...`);

    tlsSocket = tls.connect(tlsOptions, () => {
        connected = true;
        console.log(`[CoT] Connected to TAKServer ${host}:${port}`);
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    });

    tlsSocket.on("error", (err) => {
        console.error(`[CoT] TLS error: ${err.message}`);
        connected = false;
    });

    tlsSocket.on("close", () => {
        console.log("[CoT] TAKServer connection closed");
        connected = false;
        scheduleReconnect();
    });

    tlsSocket.on("data", () => {});
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    console.log("[CoT] Reconnecting in 10 seconds...");
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connectTAK(); }, 10000);
}

function sendCoT(xml) {
    if (!connected || !tlsSocket || tlsSocket.destroyed) return;
    try { tlsSocket.write(xml + "\n"); }
    catch (err) { console.error(`[CoT] Send error: ${err.message}`); connected = false; }
}

function emitPosition() {
    const fix = gps.getData();
    if (fix && fix.fix && fix.lat && fix.lon) {
        const xml = buildCoT(fix.lat, fix.lon, fix.altitude, fix.speed * 0.44704, fix.heading);
        sendCoT(xml);
        console.log(`[CoT] Sent: ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)} → TAKServer`);
    } else {
        console.log("[CoT] No GPS fix yet — waiting for gps.js...");
    }
}

function init(appConfig) {
    config = appConfig;
    if (!config.tak || !config.tak.host) {
        console.log("[CoT] No TAK config found — CoT emitter disabled");
        return;
    }
    const host = config.tak.host;
    const port = config.tak.port || 8089;
    console.log(`[CoT] Initializing — target TAKServer ${host}:${port}`);
    console.log(`[CoT] UID: ${config.tak.uid || "LTE-CAR-01"}, Callsign: ${config.tak.callsign || "ROVER-1"}`);
    console.log("[CoT] GPS source: gps.js module (no direct serial access)");

    connectTAK();
    const emitRate = config.tak.interval_ms || 3000;
    emitInterval = setInterval(emitPosition, emitRate);
}

function stop() {
    if (emitInterval) clearInterval(emitInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (tlsSocket && !tlsSocket.destroyed) tlsSocket.destroy();
    console.log("[CoT] Stopped");
}

module.exports = { init, stop };
