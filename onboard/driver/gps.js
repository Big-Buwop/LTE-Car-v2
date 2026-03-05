// GPS Module for LTE-Car — reads NMEA from RM520N (/dev/ttyUSB1)
// Sends lat, lon, speed, heading, altitude, satellites to browser via Socket.IO
// and exposes getData() for cot.js

const { exec } = require('child_process');
const io = require('socket.io-client');

let gpsSocket = null;
let gpsData = {
    lat: 0,
    lon: 0,
    speed: 0,
    heading: 0,
    altitude: 0,
    satellites: 0,
    fix: false,
    timestamp: null
};

let serialStream = null;

function enableGNSS() {
    return new Promise((resolve) => {
        exec('mmcli -m 0 --command="AT+QGPS=1"', (err, stdout) => {
            console.log("[GPS] GNSS enable via mmcli:", (stdout || "").trim());
            setTimeout(resolve, 2000);
        });
    });
}

function parseNMEA(line) {
    if (line.startsWith('$GPRMC') || line.startsWith('$GNRMC')) {
        const parts = line.split(',');
        if (parts.length < 12) return;

        const status = parts[2];
        if (status !== 'A') {
            gpsData.fix = false;
            return;
        }

        gpsData.fix = true;
        gpsData.timestamp = parts[1];

        const rawLat = parseFloat(parts[3]);
        const latDeg = Math.floor(rawLat / 100);
        const latMin = rawLat - (latDeg * 100);
        gpsData.lat = latDeg + (latMin / 60);
        if (parts[4] === 'S') gpsData.lat = -gpsData.lat;

        const rawLon = parseFloat(parts[5]);
        const lonDeg = Math.floor(rawLon / 100);
        const lonMin = rawLon - (lonDeg * 100);
        gpsData.lon = lonDeg + (lonMin / 60);
        if (parts[6] === 'W') gpsData.lon = -gpsData.lon;

        const knots = parseFloat(parts[7]);
        if (!isNaN(knots)) {
            gpsData.speed = Math.round(knots * 1.15078 * 10) / 10;
        }

        const hdg = parseFloat(parts[8]);
        if (!isNaN(hdg)) gpsData.heading = Math.round(hdg);
    }

    if (line.startsWith('$GPGGA') || line.startsWith('$GNGGA')) {
        const parts = line.split(',');
        if (parts.length < 15) return;

        const sats = parseInt(parts[7]);
        if (!isNaN(sats)) gpsData.satellites = sats;

        const alt = parseFloat(parts[9]);
        if (!isNaN(alt)) gpsData.altitude = Math.round(alt);
    }
}

async function initiate(server, config) {
    console.log("[GPS] Initializing GNSS on RM520N...");

    await enableGNSS();

    const { spawn } = require('child_process');

    exec('stty -F /dev/ttyUSB1 115200 raw -echo', (err) => {
        if (err) console.log("[GPS] Warning: Could not configure ttyUSB1:", err.message);
    });

    setTimeout(() => {
        serialStream = spawn('cat', ['/dev/ttyUSB1']);
        let buffer = '';

        serialStream.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            lines.forEach(line => {
                line = line.trim();
                if (line.startsWith('$')) {
                    parseNMEA(line);
                }
            });
        });

        serialStream.stderr.on('data', () => {});

        serialStream.on('close', (code) => {
            console.log("[GPS] Serial stream closed with code:", code);
        });

        console.log("[GPS] Reading NMEA from /dev/ttyUSB1");
    }, 1000);

    // Socket.IO connection to server for browser GPS relay
    const url = `http://${config.host}:${config.port_http}`;
    gpsSocket = io(url);
    gpsSocket.on("connect", () => console.log("[GPS] Socket.IO connected for browser relay"));
    gpsSocket.on("disconnect", () => console.log("[GPS] Socket.IO disconnected"));

    // Send GPS data to browser via Socket.IO every 500ms
    setInterval(() => {
        if (gpsSocket && gpsSocket.connected) {
            gpsSocket.emit('gps-data', gpsData);
        }
    }, 500);

    console.log("[GPS] GPS module ready — streaming to server every 500ms");
}

function shutdown() {
    if (serialStream) {
        serialStream.kill();
        console.log("[GPS] Serial stream stopped");
    }
    if (gpsSocket) {
        gpsSocket.disconnect();
    }
}

module.exports = {
    init: (server, config) => {
        initiate(server, config);
    },
    getData: () => gpsData,
    shutdown: shutdown
}
