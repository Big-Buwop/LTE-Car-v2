# LTE-Car on BlackGrid

Raspberry Pi 4 RC car controller over private LTE (Open5GS + Baicells Nova 430H).

## Quick Links
- [Full Setup Guide](docs/LTE-Car-BlackGrid-Setup-v5.md)
- [Historical Notes](docs/LTE-Car-BlackGrid-Setup-v3.md)

## Hardware
- Raspberry Pi 4
- Quectel RM520N-GL LTE HAT
- OV5647 camera
- Baicells Nova 430H eNodeB
- Open5GS EPC (10.10.40.100)

## Structure
- `onboard/` — Pi Node.js application (video, GPS, controls, CoT)
- `server/` — Relay server (runs on Open5GS box, 10.10.40.100)
- `scripts/` — Boot-time helpers (LTE connect, systemd units)
- `docs/` — Setup and troubleshooting guides

## Setup
See [LTE-Car-BlackGrid-Setup-v5.md](docs/LTE-Car-BlackGrid-Setup-v5.md).

## Status
- [x] Phase 1: Wi-Fi baseline (camera, controls, video stream)
- [x] Phase 2: RM520N LTE integration + GPS + TAKServer CoT
- [ ] Phase 3: First drive
