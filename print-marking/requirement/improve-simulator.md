You misunderstood the purpose of Device Simulator Service.

Current implementation behaves like a device management dashboard where devices must be manually added.

This is NOT the requirement.

Device Simulator Service must behave as a complete virtual factory environment.

When the service starts, it must automatically create and run:

* Virtual Printer Device
* Virtual Laser Device
* Virtual Vision Device
* Virtual PLC Device
* Virtual Factory Gateway Device

No manual device creation is allowed.

The simulator itself owns and hosts these devices.

Requirements:

1. Virtual Printer Emulator

* Auto start on application startup
* Listen on TCP 9100
* Accept ZPL/EPL payloads
* Maintain job history
* Broadcast received print jobs via SignalR
* UI must show:

  * Online/Offline status
  * Job count
  * Last received ZPL
  * Print result

2. Virtual Laser Emulator

* Auto start
* TCP command listener
* Accept MARK commands
* Simulate processing delay
* Return SUCCESS / FAILED
* Broadcast command execution to UI

3. Virtual Vision Emulator

* Auto start
* Accept VERIFY requests
* Generate PASS/FAIL responses
* Configurable success rate
* Broadcast verification events

4. Virtual PLC Emulator

* Auto start
* Modbus TCP simulator
* Expose registers:

  * START_BUTTON
  * STOP_BUTTON
  * SENSOR_IN
  * SENSOR_OUT
  * MACHINE_READY
* UI can toggle register values
* Broadcast register changes

5. Virtual Factory Gateway

* Auto start MQTT client
* Connect to MQTT broker using .env settings
* Publish factory events
* Support manual event generation
* Support scheduled event generation

6. MQTT Adapter Compatibility

Validate and enforce exact payload contract:

{
"site": "...",
"area": "...",
"line": "...",
"machine": "...",
"edge_id": "...",
"timestamp": "...",
"event_id": "...",
"data": [
{
"tag": "...",
"value": "...",
"quality": "GOOD"
}
]
}

Create shared DTO and JSON schema validation.

7. Realtime Dashboard

Replace current empty device page.

Dashboard must automatically show:

Printer
Laser
Vision
PLC
Factory Gateway

Each card displays:

* Connection status
* Last request
* Last response
* Processing state
* Event counters

8. Live Event Timeline

Add realtime timeline:

Gateway Published Event
MQTT Adapter Received Event
Line Logic Started
Printer Executed
Laser Executed
Vision Verified
PLC Updated

9. SignalR

All device activity must stream to UI in realtime.

10. Documentation

Update README.md and Claude Code documentation.

Document:

* simulator architecture
* virtual device lifecycle
* MQTT payload contract
* supported protocols
* test scenarios
* integration flow

The simulator must emulate real factory devices, not merely manage device definitions.
