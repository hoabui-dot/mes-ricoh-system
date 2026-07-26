# MQTT Adapter Service

The **MQTT Adapter Service** acts as the gateway's communication bridge at the edge level. It is built as a background .NET worker process.

## Purpose
- Subscribes to MQTT topics from **ND Factory Gateway** to ingest print, marking, and control jobs.
- Writes incoming MQTT payloads into a local `mqtt_messages` database table to support deduplication and offline ingestion.
- Wires up the **Outbox Pattern** through the `mqtt_outbox_events` table to reliably publish outbound events back to the gateway.

## Database & Schema (`mqtt.db`)
- **`mqtt_messages`**: Stores message payloads, direction (`INBOUND`/`OUTBOUND`), and processing state.
- **`mqtt_outbox_events`**: Stores outbound messages pending dispatch to the MQTT broker.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Running Redis instance (defaults to `localhost:6379`)
- Running MQTT Broker (e.g. Mosquitto on `localhost:1883`)

### Steps to Run
1. Navigate to the worker folder:
   ```bash
   cd services/mqtt-adapter/src/ND.MqttAdapter.Worker
   ```
2. Run the application:
   ```bash
   dotnet run
   ```

### Configuration Variables
Configure settings using `appsettings.json` or Environment Variables:
- `Mqtt__BrokerHost`: IP/domain of the MQTT Broker (default: `localhost`).
- `Mqtt__BrokerPort`: Port of the MQTT Broker (default: `1883`).
- `Mqtt__StationId`: Identity of the edge station (default: `STATION-01`).
- `Mqtt__Username` / `Mqtt__Password`: MQTT Broker credentials.
- `Mqtt__UseTls`: Enable/disable secure mTLS connection.
- `ConnectionStrings__Sqlite`: Overrides the database path (default: `mqtt.db` relative to run directory, or `/data/mqtt.db` in Production/Docker).
- `ConnectionStrings__Redis`: Overrides the Redis connection details.
