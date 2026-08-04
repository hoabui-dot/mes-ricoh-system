# Build And Static Evidence

- MES Execution `go test ./...`: PASS.
- MES Execution tagged integration packages: PASS in 6.144s and 1.694s.
- Kiosk Gateway `go test ./...`: PASS.
- Kiosk Gateway Kafka/WebSocket tagged integration packages: PASS.
- Kiosk UI typecheck and production build: PASS, 1535 modules.
- MES Console typecheck and production build: PASS, 2759 modules.
- `git diff --check`: PASS.
- Docker builds and forced recreation: PASS.
- Final images:
  - Execution: `sha256:a57dc9977271df40315fe9b412409d40cdee14ae4763309d2b0e667cce853ac2`
  - Kiosk UI: `sha256:7a05845035c54ccd9512e972214a85b2c024832056fa75cb21618afed4d4fc00`
  - MES Console: `sha256:e367c3523d9d17200656089365d893049ce88bc250ff84a882a28b1a6b91e615`
