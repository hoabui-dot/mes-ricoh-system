# Vision Service

The **Vision Service** handles product quality validation and barcode/OCR inspections. It is exposed as an HTTP service listening on port **5005**.

## Purpose
- Manages connection and configuration of inspection cameras (USB, GigE, RTSP).
- Executes verification calls, validating printed barcodes and text accuracy.
- Saves inspection snapshot images to the configured local storage folder.
- Returns pass/fail metrics along with defect reasons (e.g. `QR_MISSING`, `SERIAL_BLUR`, `OCR_ERROR`).

## Database & Schema (`vision.db`)
- **`vision_cameras`**: Metadata of inspection cameras and endpoints.
- **`vision_results`**: Audit records of each inspection attempt, listing pass/fail metrics, OCR confidence, recognized barcode values, and image storage paths.

---

## Local Setup & Run

### Prerequisites
- .NET 9 SDK
- Running Redis instance (defaults to `localhost:6379`)

### Steps to Run
1. Navigate to the API folder:
   ```bash
   cd services/vision-service/src/ND.VisionService.Api
   ```
2. Run the application:
   ```bash
   ASPNETCORE_URLS=http://localhost:5005 dotnet run
   ```

### Configuration Variables
- `ASPNETCORE_URLS`: Configures the server listening endpoint (default: `http://localhost:5005`).
- `SQLITE_VISION_PATH`: Overrides the path to the database file (default: `data/vision.db`).
- `REDIS_CONNECTION_STRING`: Connection properties for Redis (default: `localhost:6379`).
- `VISION_IMAGE_STORAGE_PATH`: Defines the path where camera verification images are saved (default: local or `/storage/vision` in Docker).
