#!/bin/bash
set -e

echo "[*] Waiting for modem..."
for i in $(seq 1 30); do
    if mmcli -m 0 > /dev/null 2>&1; then
        echo "[+] Modem found after ${i}s"
        break
    fi
    sleep 2
done

if ! mmcli -m 0 > /dev/null 2>&1; then
    echo "[!] ERROR: Modem not found after 60s"
    exit 1
fi

# Wait for LTE registration on eNodeB
echo "[*] Waiting for LTE registration..."
for j in $(seq 1 30); do
    REG=$(mmcli -m 0 --output-keyvalue 2>/dev/null | grep "modem.3gpp.registration-state" | awk -F': ' '{print $2}' | xargs)
    echo "  Attempt $j: registration-state = $REG"
    if [ "$REG" = "home" ]; then
        echo "[+] Registered on home network"
        break
    fi
    sleep 2
done
if [ "$REG" != "home" ]; then
    echo "[!] ERROR: Not registered after 60s"
    exit 1
fi

# Disable ModemManager GPS control so it stops killing GNSS sessions

echo "[*] Disconnecting old bearers..."
mmcli -m 0 --simple-disconnect 2>/dev/null || true
ip addr flush dev wwan0

echo "[*] Connecting to Open5GS (APN=internet)..."
for attempt in $(seq 1 5); do
    if mmcli -m 0 --simple-connect="apn=internet" 2>/dev/null; then
        echo "[+] Connected on attempt ${attempt}"
        break
    fi
    echo "[*] Connect failed, retrying in 5s (attempt ${attempt}/5)..."
    sleep 5
done

sleep 2

echo "[*] Reading bearer config..."
BEARER_IP=$(mmcli -b 1 -J | jq -r '.bearer."ipv4-config".address')
BEARER_GW=$(mmcli -b 1 -J | jq -r '.bearer."ipv4-config".gateway')
BEARER_PFX=$(mmcli -b 1 -J | jq -r '.bearer."ipv4-config".prefix')

if [ -z "$BEARER_IP" ] || [ "$BEARER_IP" = "null" ]; then
    echo "[!] ERROR: No IP from bearer."
    exit 1
fi

echo "[*] Configuring wwan0: ${BEARER_IP}/${BEARER_PFX} gw ${BEARER_GW}"
ip addr flush dev wwan0
ip addr add ${BEARER_IP}/${BEARER_PFX} dev wwan0
ip link set wwan0 up
ip route replace 10.45.0.0/16 via ${BEARER_GW} dev wwan0
ip route replace 10.10.40.0/24 via ${BEARER_GW} dev wwan0

echo "[*] Testing connectivity to ogstun..."
if ping -c 3 -W 2 10.45.0.1 > /dev/null 2>&1; then
    echo "[+] SUCCESS — ogstun reachable via LTE"
else
    echo "[!] FAIL — can't reach ogstun"
    exit 1
fi

echo "[*] Enabling GNSS via ModemManager..."
sleep 2
echo "[*] Enabling GNSS via AT command..."
mmcli -m 0 --command="AT+QGPSEND" 2>/dev/null || true
sleep 2
mmcli -m 0 --command="AT+QGPS=1" 2>/dev/null || true
echo "[+] GNSS enabled"
