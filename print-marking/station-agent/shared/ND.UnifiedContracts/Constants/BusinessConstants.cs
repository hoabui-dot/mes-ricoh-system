namespace ND.UnifiedContracts.Constants;

/// <summary>
/// Canonical business constants for the Print-Marking Edge Station platform.
/// All services must use these constants instead of hardcoding string values.
///
/// See: docs/product/BUSINESS_CONSTANTS.md for full documentation.
/// </summary>
public static class BusinessConstants
{
    // ─────────────────────────────────────────────────────────────────────
    // MARKING TYPES
    // Used in MQTT data tag: marking.type
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Laser marking method constants.
    /// </summary>
    public static class MarkingType
    {
        /// <summary>Standard laser engraving on surfaces.</summary>
        public const string LaserEtching = "LASER_ETCHING";

        /// <summary>Dot impact mechanical marking on metal surfaces.</summary>
        public const string LaserDotPeen = "LASER_DOT_PEEN";

        /// <summary>Generate and mark unique sequential serial numbers.</summary>
        public const string LaserSerialization = "LASER_SERIALIZATION";

        /// <summary>Laser-etch a QR code for traceability.</summary>
        public const string LaserQrMarking = "LASER_QR_MARKING";

        /// <summary>Laser-etch a barcode (1D symbology).</summary>
        public const string LaserBarcodeMarking = "LASER_BARCODE_MARKING";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            LaserEtching, LaserDotPeen, LaserSerialization, LaserQrMarking, LaserBarcodeMarking
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRINT TYPES
    // Used in MQTT data tag: print.type
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Label printing type constants.
    /// </summary>
    public static class PrintType
    {
        /// <summary>Generic label print — no specific type constraint.</summary>
        public const string LabelPrint = "LABEL_PRINT";

        /// <summary>Label where QR code is the primary element.</summary>
        public const string QrLabel = "QR_LABEL";

        /// <summary>Label where barcode is the primary element.</summary>
        public const string BarcodeLabel = "BARCODE_LABEL";

        /// <summary>Outer packaging or carton label.</summary>
        public const string PackagingLabel = "PACKAGING_LABEL";

        /// <summary>Product label applied directly on the product.</summary>
        public const string ProductLabel = "PRODUCT_LABEL";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            LabelPrint, QrLabel, BarcodeLabel, PackagingLabel, ProductLabel
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // VERIFICATION STATUS
    // Used in Job records, Vision results, and sync events
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Verification result status constants from the Vision System.
    /// </summary>
    public static class VerificationStatus
    {
        /// <summary>Vision confirmed content matches expected — product may proceed.</summary>
        public const string Pass = "VERIFIED_PASS";

        /// <summary>Content mismatch or unreadable — operator decision required.</summary>
        public const string Fail = "VERIFIED_FAIL";

        /// <summary>Transient scan failure — retry the scan automatically.</summary>
        public const string Retry = "VERIFIED_RETRY";

        /// <summary>Authorized operator explicitly skipped verification — must be logged.</summary>
        public const string Bypass = "VERIFIED_BYPASS";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            Pass, Fail, Retry, Bypass
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // DATA QUALITY
    // Used in MQTT data[].quality field
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Data quality indicators for MQTT tag values.
    /// </summary>
    public static class DataQuality
    {
        /// <summary>Reliable value from device — trust this value.</summary>
        public const string Good = "GOOD";

        /// <summary>Device confidence is low — log warning, use with caution.</summary>
        public const string Uncertain = "UNCERTAIN";

        /// <summary>Invalid value from device — do not use for business decisions.</summary>
        public const string Bad = "BAD";

        /// <summary>No value available — tag not populated by device.</summary>
        public const string Missing = "MISSING";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            Good, Uncertain, Bad, Missing
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRODUCTION OPERATIONS
    // Used in MQTT data tag: operation.type
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Production operation type constants.
    /// Defines what the station must execute for this job.
    /// </summary>
    public static class ProductionOperation
    {
        /// <summary>Label printing only. No laser. Vision verification of label included.</summary>
        public const string PrintOnly = "PRINT_ONLY";

        /// <summary>Laser marking only. No printer. Vision verification of mark included.</summary>
        public const string MarkOnly = "MARK_ONLY";

        /// <summary>Both printer and laser required. Print → Laser → Verify.</summary>
        public const string PrintAndMark = "PRINT_AND_MARK";

        /// <summary>Inspection only. No printing or marking. Vision only.</summary>
        public const string VerifyOnly = "VERIFY_ONLY";

        /// <summary>Reprocessing a previously failed product. Requires operator approval.</summary>
        public const string Rework = "REWORK";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            PrintOnly, MarkOnly, PrintAndMark, VerifyOnly, Rework
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // OVERWRITE TYPES
    // Used in OverwriteRequest entity and rework.type MQTT tag
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Overwrite operation type constants.
    /// All overwrites require operator approval and are permanently logged.
    /// </summary>
    public static class OverwriteType
    {
        /// <summary>Reprint the label only.</summary>
        public const string Reprint = "REPRINT";

        /// <summary>Redo the laser marking only.</summary>
        public const string Relaser = "RELASER";

        /// <summary>Force verification status to PASS. Product is flagged as BYPASS.</summary>
        public const string ForcePass = "FORCE_PASS";

        /// <summary>Force the entire job to COMPLETE status regardless of individual results.</summary>
        public const string ForceComplete = "FORCE_COMPLETE";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            Reprint, Relaser, ForcePass, ForceComplete
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // TRIGGER TYPES
    // Used in JobAttempt entity
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// How a job attempt was triggered.
    /// </summary>
    public static class TriggerType
    {
        /// <summary>Triggered automatically by incoming MQTT event from Gateway.</summary>
        public const string Auto = "AUTO";

        /// <summary>Operator manually triggered retry from Kiosk UI.</summary>
        public const string ManualRetry = "MANUAL_RETRY";

        /// <summary>Triggered by approved overwrite request.</summary>
        public const string Overwrite = "OVERWRITE";

        public static readonly IReadOnlySet<string> All = new HashSet<string>
        {
            Auto, ManualRetry, Overwrite
        };

        public static bool IsValid(string value) => All.Contains(value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // EVENT TYPES
    // Used in all events published internally and to Factory Gateway
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Business event type constants.
    /// See docs/product/EVENT_MODEL.md for full event catalog.
    /// </summary>
    public static class EventType
    {
        // Print
        public const string PrintRequested = "PRINT_REQUESTED";
        public const string PrintStarted = "PRINT_STARTED";
        public const string PrintCompleted = "PRINT_COMPLETED";
        public const string PrintFailed = "PRINT_FAILED";
        public const string PrintRetrying = "PRINT_RETRYING";

        // Mark (Laser)
        public const string MarkRequested = "MARK_REQUESTED";
        public const string MarkStarted = "MARK_STARTED";
        public const string MarkCompleted = "MARK_COMPLETED";
        public const string MarkFailed = "MARK_FAILED";
        public const string MarkRetrying = "MARK_RETRYING";

        // Verification
        public const string VerifyStarted = "VERIFY_STARTED";
        public const string VerifyPass = "VERIFY_PASS";
        public const string VerifyFail = "VERIFY_FAIL";
        public const string VerifyRetry = "VERIFY_RETRY";
        public const string VerifyBypass = "VERIFY_BYPASS";

        // Job Lifecycle
        public const string JobCreated = "JOB_CREATED";
        public const string JobStarted = "JOB_STARTED";
        public const string JobCompleted = "JOB_COMPLETED";
        public const string JobFailed = "JOB_FAILED";
        public const string JobCancelled = "JOB_CANCELLED";

        // Overwrite
        public const string OverwriteRequested = "OVERWRITE_REQUESTED";
        public const string OverwriteApproved = "OVERWRITE_APPROVED";
        public const string OverwriteRejected = "OVERWRITE_REJECTED";
        public const string OverwriteExecuted = "OVERWRITE_EXECUTED";

        // Sync
        public const string SyncStarted = "SYNC_STARTED";
        public const string SyncCompleted = "SYNC_COMPLETED";
        public const string SyncFailed = "SYNC_FAILED";
        public const string SyncRetrying = "SYNC_RETRYING";

        // PLC
        public const string PlcLineStateChanged = "PLC_LINE_STATE_CHANGED";
        public const string PlcTriggerDetected = "PLC_TRIGGER_DETECTED";
        public const string PlcFaultDetected = "PLC_FAULT_DETECTED";
        public const string PlcFaultCleared = "PLC_FAULT_CLEARED";

        // Device Health
        public const string DeviceOnline = "DEVICE_ONLINE";
        public const string DeviceOffline = "DEVICE_OFFLINE";
    }

    // ─────────────────────────────────────────────────────────────────────
    // MQTT DATA TAGS
    // Well-known tag names used in the data[] array of MQTT messages
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Well-known MQTT data tag names.
    /// See docs/product/MQTT_PAYLOAD_CONTRACT.md for full tag catalog.
    /// </summary>
    public static class MqttTag
    {
        public const string OperationType = "operation.type";
        public const string PrintType = "print.type";
        public const string MarkingType = "marking.type";
        public const string ProductId = "product.id";
        public const string ProductLot = "product.lot";
        public const string ProductMfgDate = "product.mfg_date";
        public const string ProductExpDate = "product.exp_date";
        public const string MarkingSerial = "marking.serial";
        public const string MarkingLot = "marking.lot";
        public const string MarkingDateCode = "marking.date_code";
        public const string VerifyExpectedContent = "verify.expected_content";
        public const string VerifyCameraId = "verify.camera_id";
        public const string ReworkOriginalJobId = "rework.original_job_id";
        public const string ReworkType = "rework.type";
        public const string ReworkOperatorId = "rework.operator_id";
    }
}
