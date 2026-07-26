// ─────────────────────────────────────────────────────────────────────────────
// Test Definitions — Device Simulator Integration Test Suite
// ─────────────────────────────────────────────────────────────────────────────

export type TestCategory =
  | 'Authentication'
  | 'Permission'
  | 'Production'
  | 'Rework'
  | 'DeviceHealth'
  | 'SignalR'
  | 'Failure'

export type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped'

export type StepAction =
  | 'TriggerPrintJob'
  | 'TriggerMarkJob'
  | 'TriggerPrintMarkJob'
  | 'WaitForJobCompleted'
  | 'WaitForJobFailed'
  | 'VerifyJobExists'
  | 'VerifyJobStatus'
  | 'VerifyDeviceStatus'
  | 'DisablePrinter'
  | 'EnablePrinter'
  | 'DisableLaser'
  | 'EnableLaser'
  | 'DisableVision'
  | 'EnableVision'
  | 'DisablePLC'
  | 'EnablePLC'
  | 'DisableGateway'
  | 'EnableGateway'
  | 'ResetDevices'
  | 'CheckSignalRConnected'
  | 'CheckSignalREvent'
  | 'HttpGet'
  | 'HttpPost'
  | 'HttpDelete'
  | 'Sleep'

// ─────────────────────────────────────────────────────────────────────────────
// Parameter definition — fields shown as inputs on the test card
// ─────────────────────────────────────────────────────────────────────────────
export interface TestParameter {
  key: string
  label: string
  labelVi: string
  type: 'text' | 'password' | 'url' | 'number' | 'select'
  defaultValue: string
  options?: string[]        // for select type
  placeholder?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// API detail — shows on the card what endpoint + model are used
// ─────────────────────────────────────────────────────────────────────────────
export interface ApiDetail {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'MQTT'
  endpoint: string
  service: string           // human-readable service name
  model?: string            // JSON request model shape (shown as code block)
}

export interface TestStep {
  action: StepAction
  description: string
  descriptionVi: string
  /** Supports {{paramKey}} interpolation for runtime param values */
  url?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Supports {{paramKey}} string/nested values in body */
  body?: Record<string, any>
  expectedStatus?: number
  assertPath?: string
  assertValue?: string
  durationMs?: number
  jobStatusExpected?: string
  device?: 'printer' | 'laser' | 'vision' | 'plc' | 'gateway'
  deviceOnline?: boolean
  scenario?: string
}

export interface TestDefinition {
  id: string
  name: string
  nameVi: string
  category: TestCategory
  description: string
  descriptionVi: string
  steps: TestStep[]
  isManual?: boolean
  /** Editable input fields shown on the test card */
  parameters?: TestParameter[]
  /** API calls made during this test — shown on card for transparency */
  apiDetails?: ApiDetail[]
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────
const authTests: TestDefinition[] = [
  {
    id: 'auth-login-success',
    name: 'Login Success',
    nameVi: 'Đăng nhập thành công',
    category: 'Authentication',
    description: 'Verifies that a valid credential returns a 200 token response from the Auth API.',
    descriptionVi: 'Xác minh thông tin hợp lệ trả về phản hồi token 200 từ Auth API.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/auth/login',
        service: 'Kiosk UI Auth API',
        model: `{\n  "username": "{{username}}",\n  "password": "{{password}}"\n}`,
      },
    ],
    steps: [
      {
        action: 'HttpPost',
        url: '/api/auth/login',
        method: 'POST',
        body: { username: '{{username}}', password: '{{password}}' },
        expectedStatus: 200,
        description: 'POST /api/auth/login with credentials → expect 200 + token',
        descriptionVi: 'POST /api/auth/login với thông tin đăng nhập → kỳ vọng 200 + token',
      },
    ],
  },
  {
    id: 'auth-login-failed',
    name: 'Login Failed — Wrong Password',
    nameVi: 'Đăng nhập thất bại — Sai mật khẩu',
    category: 'Authentication',
    description: 'Verifies that an invalid password returns 401 Unauthorized.',
    descriptionVi: 'Xác minh mật khẩu sai trả về 401 Unauthorized.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/auth/login',
        service: 'Kiosk UI Auth API',
        model: `{\n  "username": "{{username}}",\n  "password": "WrongPassword!"\n}`,
      },
    ],
    steps: [
      {
        action: 'HttpPost',
        url: '/api/auth/login',
        method: 'POST',
        body: { username: '{{username}}', password: 'WrongPassword!' },
        expectedStatus: 401,
        description: 'POST /api/auth/login with wrong password → expect 401',
        descriptionVi: 'POST /api/auth/login với mật khẩu sai → kỳ vọng 401',
      },
    ],
  },
  {
    id: 'auth-user-disabled',
    name: 'Disabled User Login',
    nameVi: 'Đăng nhập tài khoản bị vô hiệu',
    category: 'Authentication',
    description: 'Verifies that a disabled user account cannot log in (expects 401).',
    descriptionVi: 'Xác minh tài khoản bị vô hiệu không thể đăng nhập (kỳ vọng 401).',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/auth/login',
        service: 'Kiosk UI Auth API',
        model: `{\n  "username": "disabled_user",\n  "password": "Test1234!"\n}`,
      },
    ],
    steps: [
      {
        action: 'HttpPost',
        url: '/api/auth/login',
        method: 'POST',
        body: { username: 'disabled_user', password: 'Test1234!' },
        expectedStatus: 401,
        description: 'POST /api/auth/login with disabled account → expect 401',
        descriptionVi: 'POST /api/auth/login với tài khoản bị vô hiệu → kỳ vọng 401',
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 2. PERMISSION CONTROL
// ─────────────────────────────────────────────────────────────────────────────
const permissionTests: TestDefinition[] = [
  {
    id: 'perm-view-history',
    name: 'View History Permission',
    nameVi: 'Quyền xem lịch sử',
    category: 'Permission',
    description: 'Verifies that authorized users can access the production history endpoint.',
    descriptionVi: 'Xác minh người dùng có quyền truy cập lịch sử sản xuất.',
    apiDetails: [
      {
        method: 'GET',
        endpoint: '/api/jobs',
        service: 'Device Simulator API (port 5008)',
        model: undefined,
      },
    ],
    steps: [
      {
        action: 'HttpGet',
        url: '/api/jobs',
        method: 'GET',
        expectedStatus: 200,
        description: 'GET /api/jobs — verify history accessible',
        descriptionVi: 'GET /api/jobs — xác minh quyền truy cập lịch sử',
      },
    ],
  },
  {
    id: 'perm-rework',
    name: 'Rework Permission',
    nameVi: 'Quyền làm lại',
    category: 'Permission',
    description: 'Verifies rework endpoints are accessible.',
    descriptionVi: 'Xác minh các endpoint làm lại có thể truy cập.',
    apiDetails: [
      {
        method: 'GET',
        endpoint: '/api/jobs?status=Failed',
        service: 'Device Simulator API (port 5008)',
      },
    ],
    steps: [
      {
        action: 'HttpGet',
        url: '/api/jobs?status=Failed',
        method: 'GET',
        expectedStatus: 200,
        description: 'GET /api/jobs?status=Failed — retrieve failed jobs for rework',
        descriptionVi: 'GET /api/jobs?status=Failed — lấy lệnh lỗi để làm lại',
      },
    ],
  },
  {
    id: 'perm-denied',
    name: 'Permission Denied',
    nameVi: 'Từ chối quyền truy cập',
    category: 'Permission',
    description: 'Verifies that unauthorized access to RBAC endpoints returns 401/403.',
    descriptionVi: 'Xác minh truy cập trái phép vào endpoint RBAC trả về 401/403.',
    apiDetails: [
      {
        method: 'GET',
        endpoint: '/api/rbac/users',
        service: 'Kiosk UI RBAC API (Requires SYSTEM_ADMIN)',
      },
    ],
    steps: [
      {
        action: 'HttpGet',
        url: '/api/rbac/users',
        method: 'GET',
        expectedStatus: 401,
        description: 'GET /api/rbac/users without auth → expect 401',
        descriptionVi: 'GET /api/rbac/users không có xác thực → kỳ vọng 401',
      },
    ],
  },
  {
    id: 'perm-add-permissions',
    name: 'Add User Permissions',
    nameVi: 'Cấp quyền cho người dùng',
    category: 'Permission',
    description: 'Verifies that SYSTEM_ADMIN can create a user, grant permissions, and clean up.',
    descriptionVi: 'Xác minh SYSTEM_ADMIN có thể tạo người dùng, cấp quyền và dọn dẹp.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/auth/login',
        service: 'Kiosk UI Auth API',
        model: `{\n  "username": "{{username}}",\n  "password": "{{password}}"\n}`,
      },
      {
        method: 'POST',
        endpoint: '/api/rbac/users',
        service: 'Kiosk UI RBAC API',
        model: `{\n  "username": "temp_op_01",\n  "password": "Password123!",\n  "fullName": "Temporary Operator",\n  "roleCode": "MEMBER"\n}`,
      },
      {
        method: 'POST',
        endpoint: '/api/rbac/users/{{createdUserId}}/permissions',
        service: 'Kiosk UI RBAC API',
        model: `{\n  "permissionCodes": ["JOB_REPROCESS"]\n}`,
      },
      {
        method: 'DELETE',
        endpoint: '/api/rbac/users/{{createdUserId}}',
        service: 'Kiosk UI RBAC API',
      },
    ],
    steps: [
      {
        action: 'HttpPost',
        url: '/api/auth/login',
        method: 'POST',
        body: { username: '{{username}}', password: '{{password}}' },
        expectedStatus: 200,
        description: 'POST /api/auth/login to get Admin token',
        descriptionVi: 'POST /api/auth/login để lấy token Quản trị',
      },
      {
        action: 'HttpPost',
        url: '/api/rbac/users',
        method: 'POST',
        body: { username: 'temp_op_01', password: 'Password123!', fullName: 'Temporary Operator', roleCode: 'MEMBER' },
        expectedStatus: 200,
        description: 'POST /api/rbac/users to create temporary user',
        descriptionVi: 'POST /api/rbac/users để tạo người dùng tạm thời',
      },
      {
        action: 'HttpPost',
        url: '/api/rbac/users/{{createdUserId}}/permissions',
        method: 'POST',
        body: { permissionCodes: ['JOB_REPROCESS'] },
        expectedStatus: 200,
        description: 'POST permissions to grant JOB_REPROCESS',
        descriptionVi: 'POST permissions để cấp quyền JOB_REPROCESS',
      },
      {
        action: 'HttpGet',
        url: '/api/rbac/users',
        method: 'GET',
        expectedStatus: 200,
        description: 'GET /api/rbac/users to verify user list updated',
        descriptionVi: 'GET /api/rbac/users để xác minh danh sách người dùng được cập nhật',
      },
      {
        action: 'HttpDelete',
        url: '/api/rbac/users/{{createdUserId}}',
        method: 'DELETE',
        expectedStatus: 200,
        description: 'DELETE /api/rbac/users/{{createdUserId}} to clean up',
        descriptionVi: 'DELETE /api/rbac/users/{{createdUserId}} để dọn dẹp',
      },
    ],
  },
  {
    id: 'perm-remove-superuser',
    name: 'Remove Super User Account',
    nameVi: 'Xóa tài khoản Quản trị',
    category: 'Permission',
    description: 'Verifies that SYSTEM_ADMIN can create a new super user and then delete it.',
    descriptionVi: 'Xác minh SYSTEM_ADMIN có thể tạo tài khoản quản trị mới rồi xóa nó.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/auth/login',
        service: 'Kiosk UI Auth API',
        model: `{\n  "username": "{{username}}",\n  "password": "{{password}}"\n}`,
      },
      {
        method: 'POST',
        endpoint: '/api/rbac/users',
        service: 'Kiosk UI RBAC API',
        model: `{\n  "username": "temp_admin_01",\n  "password": "AdminPass123!",\n  "fullName": "Temporary Admin",\n  "roleCode": "SUPER_ADMIN"\n}`,
      },
      {
        method: 'DELETE',
        endpoint: '/api/rbac/users/{{createdUserId}}',
        service: 'Kiosk UI RBAC API',
      },
    ],
    steps: [
      {
        action: 'HttpPost',
        url: '/api/auth/login',
        method: 'POST',
        body: { username: '{{username}}', password: '{{password}}' },
        expectedStatus: 200,
        description: 'POST /api/auth/login to get Admin token',
        descriptionVi: 'POST /api/auth/login để lấy token Quản trị',
      },
      {
        action: 'HttpPost',
        url: '/api/rbac/users',
        method: 'POST',
        body: { username: 'temp_admin_01', password: 'AdminPass123!', fullName: 'Temporary Admin', roleCode: 'SUPER_ADMIN' },
        expectedStatus: 200,
        description: 'POST /api/rbac/users to create super admin',
        descriptionVi: 'POST /api/rbac/users để tạo quản trị viên cấp cao',
      },
      {
        action: 'HttpDelete',
        url: '/api/rbac/users/{{createdUserId}}',
        method: 'DELETE',
        expectedStatus: 200,
        description: 'DELETE /api/rbac/users/{{createdUserId}} to clean up',
        descriptionVi: 'DELETE /api/rbac/users/{{createdUserId}} để dọn dẹp',
      },
      {
        action: 'HttpGet',
        url: '/api/rbac/users',
        method: 'GET',
        expectedStatus: 200,
        description: 'GET /api/rbac/users to verify super user removed',
        descriptionVi: 'GET /api/rbac/users để xác minh tài khoản đã bị xóa',
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRODUCTION FLOW
// ─────────────────────────────────────────────────────────────────────────────
const productionTests: TestDefinition[] = [
  {
    id: 'prod-print-success',
    name: 'Print Product Success',
    nameVi: 'In nhãn sản phẩm thành công',
    category: 'Production',
    description: 'Triggers a PRINT_ONLY job via Factory Gateway MQTT and verifies job COMPLETED.',
    descriptionVi: 'Kích hoạt lệnh PRINT_ONLY qua Factory Gateway MQTT và xác minh hoàn thành.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/test/reset',
        service: 'Device Simulator API (port 5008)',
        model: undefined,
      },
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-print-job',
        service: 'Factory Gateway → MQTT Broker → Job Engine',
        model: `{\n  "jobType": "PRINT_ONLY",\n  "productCode": "SIM-{{scenario}}",\n  "serialNumber": "SN-{{timestamp}}"\n}`,
      },
      {
        method: 'GET',
        endpoint: '/api/jobs',
        service: 'Device Simulator API (port 5008) — polls until COMPLETED',
      },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerPrintJob', description: 'Send PRINT_ONLY via Factory Gateway', descriptionVi: 'Gửi PRINT_ONLY qua Factory Gateway' },
      { action: 'WaitForJobCompleted', durationMs: 8000, description: 'Wait ≤8s for COMPLETED', descriptionVi: 'Chờ ≤8s cho COMPLETED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Assert latest job = COMPLETED', descriptionVi: 'Kiểm tra lệnh mới nhất = COMPLETED' },
    ],
  },
  {
    id: 'prod-laser-success',
    name: 'Laser Mark Product Success',
    nameVi: 'Khắc laser sản phẩm thành công',
    category: 'Production',
    description: 'Triggers a MARK_ONLY job with vision pass scenario and verifies completion.',
    descriptionVi: 'Kích hoạt lệnh MARK_ONLY với kịch bản vision thành công.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/test/reset',
        service: 'Device Simulator API (port 5008)',
      },
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-mark-job',
        service: 'Factory Gateway → MQTT Broker → Job Engine',
        model: `{\n  "jobType": "MARK_ONLY",\n  "scenario": "success"\n}`,
      },
      {
        method: 'GET',
        endpoint: '/api/jobs',
        service: 'Device Simulator API — polls until COMPLETED',
      },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerMarkJob', scenario: 'success', description: 'Send MARK_ONLY — vision pass', descriptionVi: 'Gửi MARK_ONLY — vision thành công' },
      { action: 'WaitForJobCompleted', durationMs: 10000, description: 'Wait ≤10s for COMPLETED', descriptionVi: 'Chờ ≤10s cho COMPLETED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Assert MARK_ONLY = COMPLETED', descriptionVi: 'Kiểm tra MARK_ONLY = COMPLETED' },
    ],
  },
  {
    id: 'prod-print-mark-success',
    name: 'Print + Mark Success',
    nameVi: 'In + Khắc laser thành công',
    category: 'Production',
    description: 'Full PRINT_AND_MARK: print label → laser mark → vision verify → COMPLETED.',
    descriptionVi: 'Quy trình đầy đủ: in nhãn → khắc laser → kiểm tra vision → COMPLETED.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/test/reset',
        service: 'Device Simulator API (port 5008)',
      },
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-print-mark-job',
        service: 'Factory Gateway → MQTT Broker → Job Engine',
        model: `{\n  "jobType": "PRINT_AND_MARK",\n  "scenario": "success"\n}`,
      },
      {
        method: 'GET',
        endpoint: '/api/jobs',
        service: 'Device Simulator API — polls until COMPLETED',
      },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerPrintMarkJob', scenario: 'success', description: 'Send PRINT_AND_MARK — all steps succeed', descriptionVi: 'Gửi PRINT_AND_MARK — tất cả bước thành công' },
      { action: 'WaitForJobCompleted', durationMs: 15000, description: 'Wait ≤15s for COMPLETED', descriptionVi: 'Chờ ≤15s cho COMPLETED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Assert PRINT_AND_MARK = COMPLETED', descriptionVi: 'Kiểm tra PRINT_AND_MARK = COMPLETED' },
    ],
  },
  {
    id: 'prod-vision-verify-success',
    name: 'Camera Verification Success',
    nameVi: 'Kiểm tra camera thành công',
    category: 'Production',
    description: 'Verifies the vision camera inspection passes and records a PASS result.',
    descriptionVi: 'Xác minh kiểm tra camera vision thành công và ghi kết quả PASS.',
    apiDetails: [
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-mark-job',
        service: 'Factory Gateway → Vision Camera Simulator',
        model: `{\n  "jobType": "MARK_ONLY",\n  "scenario": "success"\n}`,
      },
      {
        method: 'GET',
        endpoint: '/api/vision/results',
        service: 'Device Simulator API — verify latest result = PASS',
      },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerMarkJob', scenario: 'success', description: 'Send job with PASS vision scenario', descriptionVi: 'Gửi lệnh với kịch bản vision PASS' },
      { action: 'WaitForJobCompleted', durationMs: 10000, description: 'Wait for job completion', descriptionVi: 'Chờ lệnh hoàn thành' },
      {
        action: 'HttpGet',
        url: '/api/vision/results',
        method: 'GET',
        expectedStatus: 200,
        assertPath: '[0].result',
        assertValue: 'PASS',
        description: 'GET /api/vision/results → latest result = PASS',
        descriptionVi: 'GET /api/vision/results → kết quả mới nhất = PASS',
      },
    ],
  },
  {
    id: 'prod-complete-job',
    name: 'Complete Job Success',
    nameVi: 'Lệnh sản xuất hoàn thành thành công',
    category: 'Production',
    description: 'End-to-end job lifecycle: Created → Processing → Completed.',
    descriptionVi: 'Vòng đời lệnh đầy đủ: Tạo → Xử lý → Hoàn thành.',
    apiDetails: [
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-print-job',
        service: 'Factory Gateway → Job Engine',
      },
      {
        method: 'GET',
        endpoint: '/api/jobs',
        service: 'Device Simulator API — final status = COMPLETED',
      },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerPrintJob', description: 'Create new print job', descriptionVi: 'Tạo lệnh in mới' },
      { action: 'WaitForJobCompleted', durationMs: 8000, description: 'Wait for full lifecycle', descriptionVi: 'Chờ hoàn thành vòng đời' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Final status = COMPLETED', descriptionVi: 'Trạng thái cuối = COMPLETED' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 4. REWORK FLOW
// ─────────────────────────────────────────────────────────────────────────────
const reworkTests: TestDefinition[] = [
  {
    id: 'rework-reprint',
    name: 'Reprint Product',
    nameVi: 'In lại nhãn sản phẩm',
    category: 'Rework',
    description: 'Triggers a new PRINT_ONLY job to simulate a reprint and verifies COMPLETED.',
    descriptionVi: 'Kích hoạt lệnh PRINT_ONLY mới để mô phỏng in lại và xác minh COMPLETED.',
    apiDetails: [
      { method: 'MQTT', endpoint: '/api/gateway/send-print-job', service: 'Factory Gateway → Virtual Printer (port 9100)' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerPrintJob', description: 'Send reprint job (PRINT_ONLY)', descriptionVi: 'Gửi lệnh in lại (PRINT_ONLY)' },
      { action: 'WaitForJobCompleted', durationMs: 8000, description: 'Wait ≤8s for COMPLETED', descriptionVi: 'Chờ ≤8s cho COMPLETED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Reprint = COMPLETED', descriptionVi: 'In lại = COMPLETED' },
    ],
  },
  {
    id: 'rework-remark',
    name: 'Re-Mark Product',
    nameVi: 'Khắc laser lại sản phẩm',
    category: 'Rework',
    description: 'Triggers a new MARK_ONLY job to simulate re-marking.',
    descriptionVi: 'Kích hoạt lệnh MARK_ONLY mới để mô phỏng khắc lại.',
    apiDetails: [
      { method: 'MQTT', endpoint: '/api/gateway/send-mark-job', service: 'Factory Gateway → Virtual Laser (port 8471)' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerMarkJob', scenario: 'success', description: 'Send re-mark job (MARK_ONLY)', descriptionVi: 'Gửi lệnh khắc lại (MARK_ONLY)' },
      { action: 'WaitForJobCompleted', durationMs: 10000, description: 'Wait ≤10s for COMPLETED', descriptionVi: 'Chờ ≤10s cho COMPLETED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Re-mark = COMPLETED', descriptionVi: 'Khắc lại = COMPLETED' },
    ],
  },
  {
    id: 'rework-retry-failed',
    name: 'Retry Failed Job',
    nameVi: 'Thử lại lệnh thất bại',
    category: 'Rework',
    description: 'Triggers a failing job then a successful retry and verifies the retry succeeds.',
    descriptionVi: 'Kích hoạt lệnh lỗi rồi thử lại thành công và xác minh kết quả.',
    apiDetails: [
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-mark-job',
        service: 'Factory Gateway → Vision Camera (scenario: fail_qr_mismatch → success)',
        model: `{\n  "scenario": "fail_qr_mismatch"\n} → {\n  "scenario": "success"\n}`,
      },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API (polls ×2)' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerMarkJob', scenario: 'fail_qr_mismatch', description: 'Trigger failing job (QR mismatch)', descriptionVi: 'Kích hoạt lệnh lỗi (QR mismatch)' },
      { action: 'WaitForJobFailed', durationMs: 12000, description: 'Wait for FAILED status', descriptionVi: 'Chờ trạng thái FAILED' },
      { action: 'TriggerMarkJob', scenario: 'success', description: 'Retry — send new successful job', descriptionVi: 'Thử lại — gửi lệnh mới thành công' },
      { action: 'WaitForJobCompleted', durationMs: 12000, description: 'Wait for retry to COMPLETE', descriptionVi: 'Chờ lệnh thử lại COMPLETE' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'COMPLETED', description: 'Retry = COMPLETED', descriptionVi: 'Thử lại = COMPLETED' },
    ],
  },
  {
    id: 'rework-verify-history',
    name: 'Verify New History Record',
    nameVi: 'Xác minh lịch sử lệnh mới',
    category: 'Rework',
    description: 'Confirms a new history record is created after job execution.',
    descriptionVi: 'Xác nhận bản ghi lịch sử mới được tạo sau khi thực hiện lệnh.',
    apiDetails: [
      { method: 'MQTT', endpoint: '/api/gateway/send-print-job', service: 'Factory Gateway' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API — verify ≥1 record' },
    ],
    steps: [
      { action: 'TriggerPrintJob', description: 'Create job to generate history record', descriptionVi: 'Tạo lệnh để sinh bản ghi lịch sử' },
      { action: 'WaitForJobCompleted', durationMs: 8000, description: 'Wait for job completion', descriptionVi: 'Chờ lệnh hoàn thành' },
      { action: 'HttpGet', url: '/api/jobs', method: 'GET', expectedStatus: 200, description: 'GET /api/jobs → ≥1 record returned', descriptionVi: 'GET /api/jobs → có ít nhất 1 bản ghi' },
    ],
  },
  {
    id: 'rework-verify-audit',
    name: 'Verify Audit Log Created',
    nameVi: 'Xác minh nhật ký kiểm toán',
    category: 'Rework',
    description: 'Checks that timeline events are recorded for the job.',
    descriptionVi: 'Kiểm tra sự kiện timeline được ghi lại cho lệnh.',
    apiDetails: [
      { method: 'GET', endpoint: '/api/timeline', service: 'Device Simulator API — audit events' },
    ],
    steps: [
      { action: 'TriggerPrintJob', description: 'Trigger print job to generate timeline events', descriptionVi: 'Kích hoạt lệnh in để tạo sự kiện timeline' },
      { action: 'WaitForJobCompleted', durationMs: 8000, description: 'Wait for job completion', descriptionVi: 'Chờ lệnh hoàn thành' },
      { action: 'HttpGet', url: '/api/timeline', method: 'GET', expectedStatus: 200, description: 'GET /api/timeline → audit events exist', descriptionVi: 'GET /api/timeline → sự kiện kiểm toán tồn tại' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 5. DEVICE HEALTH
// ─────────────────────────────────────────────────────────────────────────────
const deviceHealthTests: TestDefinition[] = [
  {
    id: 'health-printer-offline',
    name: 'Printer Offline',
    nameVi: 'Máy in ngoại tuyến',
    category: 'DeviceHealth',
    description: 'Disables virtual printer, triggers print job, confirms it FAILs.',
    descriptionVi: 'Vô hiệu máy in ảo, kích hoạt lệnh in, xác minh lệnh FAIL.',
    apiDetails: [
      { method: 'POST', endpoint: '/api/printer/disconnect', service: 'Device Simulator API — disable virtual printer' },
      { method: 'MQTT', endpoint: '/api/gateway/send-print-job', service: 'Factory Gateway → Printer (offline)' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API — verify FAILED' },
      { method: 'POST', endpoint: '/api/printer/connect', service: 'Device Simulator API — restore printer' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'DisablePrinter', description: 'Take virtual printer offline', descriptionVi: 'Đưa máy in ảo về ngoại tuyến' },
      { action: 'TriggerPrintJob', description: 'Trigger print job (printer offline)', descriptionVi: 'Kích hoạt lệnh in (máy in ngoại tuyến)' },
      { action: 'WaitForJobFailed', durationMs: 15000, description: 'Wait for FAILED', descriptionVi: 'Chờ FAILED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'FAILED', description: 'Assert = FAILED', descriptionVi: 'Kiểm tra = FAILED' },
      { action: 'EnablePrinter', description: 'Restore printer', descriptionVi: 'Khôi phục máy in' },
    ],
  },
  {
    id: 'health-laser-offline',
    name: 'Laser Offline',
    nameVi: 'Máy laser ngoại tuyến',
    category: 'DeviceHealth',
    description: 'Disables virtual laser, triggers mark job, confirms it FAILs.',
    descriptionVi: 'Vô hiệu máy laser ảo, kích hoạt lệnh khắc, xác minh lệnh FAIL.',
    apiDetails: [
      { method: 'POST', endpoint: '/api/laser/disconnect', service: 'Device Simulator API — disable virtual laser' },
      { method: 'MQTT', endpoint: '/api/gateway/send-mark-job', service: 'Factory Gateway → Laser (offline)' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API — verify FAILED' },
      { method: 'POST', endpoint: '/api/laser/connect', service: 'Device Simulator API — restore laser' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'DisableLaser', description: 'Take virtual laser offline', descriptionVi: 'Đưa máy laser ảo về ngoại tuyến' },
      { action: 'TriggerMarkJob', scenario: 'success', description: 'Trigger mark job (laser offline)', descriptionVi: 'Kích hoạt lệnh khắc (máy laser ngoại tuyến)' },
      { action: 'WaitForJobFailed', durationMs: 15000, description: 'Wait for FAILED', descriptionVi: 'Chờ FAILED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'FAILED', description: 'Assert = FAILED', descriptionVi: 'Kiểm tra = FAILED' },
      { action: 'EnableLaser', description: 'Restore laser', descriptionVi: 'Khôi phục máy laser' },
    ],
  },
  {
    id: 'health-vision-offline',
    name: 'Vision Offline',
    nameVi: 'Camera vision ngoại tuyến',
    category: 'DeviceHealth',
    description: 'Disables vision camera and verifies the device shows offline in status.',
    descriptionVi: 'Vô hiệu camera vision và xác minh thiết bị hiển thị ngoại tuyến.',
    apiDetails: [
      { method: 'POST', endpoint: '/api/vision/disconnect', service: 'Device Simulator API' },
      { method: 'GET', endpoint: '/api/status', service: 'Device Simulator API — check vision.online = false' },
      { method: 'POST', endpoint: '/api/vision/connect', service: 'Device Simulator API — restore' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'DisableVision', description: 'Take vision camera offline', descriptionVi: 'Đưa camera vision về ngoại tuyến' },
      { action: 'VerifyDeviceStatus', device: 'vision', deviceOnline: false, description: 'Confirm vision.online = false', descriptionVi: 'Xác nhận vision.online = false' },
      { action: 'EnableVision', description: 'Restore vision camera', descriptionVi: 'Khôi phục camera vision' },
    ],
  },
  {
    id: 'health-gateway-offline',
    name: 'Gateway Offline',
    nameVi: 'Gateway nhà máy ngoại tuyến',
    category: 'DeviceHealth',
    description: 'Disconnects factory gateway and verifies disconnected state.',
    descriptionVi: 'Ngắt kết nối gateway nhà máy và xác minh trạng thái ngắt kết nối.',
    apiDetails: [
      { method: 'POST', endpoint: '/api/gateway/disconnect', service: 'Device Simulator API — disconnect MQTT broker' },
      { method: 'GET', endpoint: '/api/status', service: 'Device Simulator API — check gateway.connected = false' },
      { method: 'POST', endpoint: '/api/gateway/connect', service: 'Device Simulator API — restore' },
    ],
    steps: [
      { action: 'DisableGateway', description: 'Disconnect Factory Gateway MQTT', descriptionVi: 'Ngắt kết nối MQTT của Factory Gateway' },
      { action: 'VerifyDeviceStatus', device: 'gateway', deviceOnline: false, description: 'Confirm gateway.connected = false', descriptionVi: 'Xác nhận gateway.connected = false' },
      { action: 'EnableGateway', description: 'Reconnect Factory Gateway', descriptionVi: 'Kết nối lại Factory Gateway' },
    ],
  },
  {
    id: 'health-heartbeat-timeout',
    name: 'Heartbeat / Connection Health',
    nameVi: 'Kiểm tra sức khoẻ kết nối',
    category: 'DeviceHealth',
    description: 'Verifies the connection monitor table shows current status for all services.',
    descriptionVi: 'Xác minh bảng giám sát kết nối hiển thị trạng thái hiện tại.',
    apiDetails: [
      { method: 'GET', endpoint: '/api/connections', service: 'Device Simulator API — connection health table' },
    ],
    steps: [
      { action: 'HttpGet', url: '/api/connections', method: 'GET', expectedStatus: 200, description: 'GET /api/connections — verify connection health table', descriptionVi: 'GET /api/connections — kiểm tra bảng kết nối' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 6. SIGNALR
// ─────────────────────────────────────────────────────────────────────────────
const signalRTests: TestDefinition[] = [
  {
    id: 'signalr-status-update',
    name: 'Realtime Device Status Update',
    nameVi: 'Cập nhật trạng thái thiết bị thời gian thực',
    category: 'SignalR',
    description: 'Triggers a print job and verifies SimulatorStatusUpdated SignalR event is received.',
    descriptionVi: 'Kích hoạt lệnh in và xác minh sự kiện SignalR SimulatorStatusUpdated được nhận.',
    apiDetails: [
      { method: 'MQTT', endpoint: '/hubs/simulator → SimulatorStatusUpdated', service: 'SignalR Hub (/hubs/simulator)' },
      { method: 'MQTT', endpoint: '/api/gateway/send-print-job', service: 'Factory Gateway → triggers SignalR event' },
    ],
    steps: [
      { action: 'CheckSignalRConnected', description: 'Verify SignalR hub is connected', descriptionVi: 'Xác minh SignalR hub đã kết nối' },
      { action: 'TriggerPrintJob', description: 'Trigger print job to generate SignalR events', descriptionVi: 'Kích hoạt lệnh in để tạo sự kiện SignalR' },
      { action: 'CheckSignalREvent', description: 'Verify SimulatorStatusUpdated received', descriptionVi: 'Xác minh SimulatorStatusUpdated đã nhận' },
    ],
  },
  {
    id: 'signalr-history-update',
    name: 'Realtime Production History Update',
    nameVi: 'Cập nhật lịch sử sản xuất thời gian thực',
    category: 'SignalR',
    description: 'Verifies SignalR hub pushes TimelineEventAdded events during job execution.',
    descriptionVi: 'Xác minh SignalR hub đẩy sự kiện TimelineEventAdded trong quá trình thực thi.',
    apiDetails: [
      { method: 'MQTT', endpoint: '/hubs/simulator → TimelineEventAdded', service: 'SignalR Hub — timeline broadcast' },
      { method: 'GET', endpoint: '/api/timeline', service: 'Device Simulator API' },
    ],
    steps: [
      { action: 'CheckSignalRConnected', description: 'Verify SignalR hub connected', descriptionVi: 'Xác minh SignalR hub kết nối' },
      { action: 'TriggerPrintJob', description: 'Trigger print job', descriptionVi: 'Kích hoạt lệnh in' },
      { action: 'WaitForJobCompleted', durationMs: 8000, description: 'Wait for job completion', descriptionVi: 'Chờ lệnh hoàn thành' },
      { action: 'HttpGet', url: '/api/timeline', method: 'GET', expectedStatus: 200, description: 'GET /api/timeline — confirm events logged', descriptionVi: 'GET /api/timeline — xác minh sự kiện được ghi' },
    ],
  },
  {
    id: 'signalr-job-status',
    name: 'Realtime Job Status Update',
    nameVi: 'Cập nhật trạng thái lệnh thời gian thực',
    category: 'SignalR',
    description: 'Verifies the SignalR hub is live and device state is accessible.',
    descriptionVi: 'Xác minh SignalR hub hoạt động và trạng thái thiết bị có thể truy cập.',
    apiDetails: [
      { method: 'GET', endpoint: '/hubs/simulator', service: 'SignalR Hub WebSocket endpoint' },
      { method: 'GET', endpoint: '/api/status', service: 'Device Simulator API' },
    ],
    steps: [
      { action: 'CheckSignalRConnected', description: 'Verify SignalR connection is alive', descriptionVi: 'Xác minh kết nối SignalR đang hoạt động' },
      { action: 'HttpGet', url: '/api/status', method: 'GET', expectedStatus: 200, description: 'GET /api/status — confirm live status available', descriptionVi: 'GET /api/status — xác minh trạng thái trực tiếp' },
    ],
  },
  {
    id: 'signalr-reconnect',
    name: 'Reconnect Scenario',
    nameVi: 'Kịch bản kết nối lại',
    category: 'SignalR',
    description: 'Verifies the SignalR hub endpoint /hubs/simulator is reachable.',
    descriptionVi: 'Xác minh endpoint SignalR hub /hubs/simulator có thể kết nối.',
    apiDetails: [
      { method: 'GET', endpoint: '/hubs/simulator (WebSocket upgrade)', service: 'SignalR Hub — auto-reconnect capable' },
    ],
    steps: [
      { action: 'CheckSignalRConnected', description: 'Verify SignalR hub reachable at /hubs/simulator', descriptionVi: 'Xác minh hub có thể kết nối tại /hubs/simulator' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 7. FAILURE SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
const failureTests: TestDefinition[] = [
  {
    id: 'fail-printer-busy',
    name: 'Printer Busy / Offline',
    nameVi: 'Máy in bận / ngoại tuyến',
    category: 'Failure',
    description: 'Simulates printer offline and verifies print job FAILs gracefully.',
    descriptionVi: 'Mô phỏng máy in bận và xác minh lệnh in thất bại an toàn.',
    apiDetails: [
      { method: 'POST', endpoint: '/api/printer/disconnect', service: 'Device Simulator API' },
      { method: 'MQTT', endpoint: '/api/gateway/send-print-job', service: 'Factory Gateway → Printer (offline)' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API — verify FAILED' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'DisablePrinter', description: 'Simulate printer busy/offline', descriptionVi: 'Mô phỏng máy in bận/ngoại tuyến' },
      { action: 'TriggerPrintJob', description: 'Send print job to busy printer', descriptionVi: 'Gửi lệnh in đến máy in đang bận' },
      { action: 'WaitForJobFailed', durationMs: 15000, description: 'Confirm job fails', descriptionVi: 'Xác nhận lệnh thất bại' },
      { action: 'EnablePrinter', description: 'Restore printer', descriptionVi: 'Khôi phục máy in' },
    ],
  },
  {
    id: 'fail-laser-busy',
    name: 'Laser Busy / Offline',
    nameVi: 'Máy laser bận / ngoại tuyến',
    category: 'Failure',
    description: 'Simulates laser offline and verifies mark job FAILs.',
    descriptionVi: 'Mô phỏng máy laser bận và xác minh lệnh khắc thất bại.',
    apiDetails: [
      { method: 'POST', endpoint: '/api/laser/disconnect', service: 'Device Simulator API' },
      { method: 'MQTT', endpoint: '/api/gateway/send-mark-job', service: 'Factory Gateway → Laser (offline)' },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API — verify FAILED' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'DisableLaser', description: 'Simulate laser busy/offline', descriptionVi: 'Mô phỏng máy laser bận/ngoại tuyến' },
      { action: 'TriggerMarkJob', scenario: 'success', description: 'Send mark job to busy laser', descriptionVi: 'Gửi lệnh khắc đến máy laser đang bận' },
      { action: 'WaitForJobFailed', durationMs: 15000, description: 'Confirm job fails', descriptionVi: 'Xác nhận lệnh thất bại' },
      { action: 'EnableLaser', description: 'Restore laser', descriptionVi: 'Khôi phục máy laser' },
    ],
  },
  {
    id: 'fail-vision-qr-mismatch',
    name: 'Vision Failure — QR Mismatch',
    nameVi: 'Lỗi vision — QR không khớp',
    category: 'Failure',
    description: 'Sends a mark job with QR mismatch scenario — vision returns FAIL.',
    descriptionVi: 'Gửi lệnh khắc với kịch bản QR không khớp — vision trả về FAIL.',
    apiDetails: [
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-mark-job',
        service: 'Factory Gateway → Vision Camera (scenario: fail_qr_mismatch)',
        model: `{\n  "scenario": "fail_qr_mismatch"\n}`,
      },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API — verify FAILED' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerMarkJob', scenario: 'fail_qr_mismatch', description: 'Send mark job — QR mismatch vision', descriptionVi: 'Gửi lệnh khắc — vision QR không khớp' },
      { action: 'WaitForJobFailed', durationMs: 12000, description: 'Wait for FAILED', descriptionVi: 'Chờ FAILED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'FAILED', description: 'Assert = FAILED (QR mismatch)', descriptionVi: 'Kiểm tra = FAILED (QR không khớp)' },
    ],
  },
  {
    id: 'fail-vision-unreadable',
    name: 'Vision Failure — Unreadable Marking',
    nameVi: 'Lỗi vision — Không đọc được khắc',
    category: 'Failure',
    description: 'Sends a job with unreadable marking scenario — vision cannot read the code.',
    descriptionVi: 'Gửi lệnh với kịch bản khắc không đọc được — vision không đọc được code.',
    apiDetails: [
      {
        method: 'MQTT',
        endpoint: '/api/gateway/send-mark-job',
        service: 'Factory Gateway → Vision Camera (scenario: fail_unreadable)',
        model: `{\n  "scenario": "fail_unreadable"\n}`,
      },
      { method: 'GET', endpoint: '/api/jobs', service: 'Device Simulator API' },
    ],
    steps: [
      { action: 'ResetDevices', description: 'Reset all devices to online', descriptionVi: 'Đặt lại thiết bị về online' },
      { action: 'TriggerMarkJob', scenario: 'fail_unreadable', description: 'Send mark job — unreadable', descriptionVi: 'Gửi lệnh khắc — không đọc được' },
      { action: 'WaitForJobFailed', durationMs: 12000, description: 'Wait for FAILED', descriptionVi: 'Chờ FAILED' },
      { action: 'VerifyJobStatus', jobStatusExpected: 'FAILED', description: 'Assert = FAILED (unreadable)', descriptionVi: 'Kiểm tra = FAILED (không đọc được)' },
    ],
  },
  {
    id: 'fail-invalid-payload',
    name: 'Invalid Payload Rejection',
    nameVi: 'Từ chối payload không hợp lệ',
    category: 'Failure',
    description: 'Sends a malformed request and verifies the API returns 400 Bad Request.',
    descriptionVi: 'Gửi yêu cầu không đúng định dạng và xác minh API trả về 400.',
    apiDetails: [
      {
        method: 'POST',
        endpoint: '/api/gateway/publish',
        service: 'Device Simulator API',
        model: `{} (empty body — should return 400)`,
      },
    ],
    steps: [
      {
        action: 'HttpPost',
        url: '/api/gateway/publish',
        method: 'POST',
        body: {},
        expectedStatus: 400,
        description: 'POST /api/gateway/publish empty body → expect 400',
        descriptionVi: 'POST /api/gateway/publish body rỗng → kỳ vọng 400',
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ALL TESTS REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_TESTS: TestDefinition[] = [
  ...authTests,
  ...permissionTests,
  ...productionTests,
  ...reworkTests,
  ...deviceHealthTests,
  ...signalRTests,
  ...failureTests,
]

export const CATEGORY_LABELS: Record<TestCategory, { en: string; vi: string }> = {
  Authentication: { en: 'Authentication', vi: 'Xác thực' },
  Permission: { en: 'Permission Control', vi: 'Kiểm soát quyền' },
  Production: { en: 'Production Flow', vi: 'Quy trình sản xuất' },
  Rework: { en: 'Rework Flow', vi: 'Quy trình làm lại' },
  DeviceHealth: { en: 'Device Health', vi: 'Sức khỏe thiết bị' },
  SignalR: { en: 'SignalR', vi: 'SignalR thời gian thực' },
  Failure: { en: 'Failure Scenarios', vi: 'Kịch bản lỗi' },
}
