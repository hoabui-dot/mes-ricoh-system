import { createI18nConfig } from '@mom-platform/i18n-ui-shared';

export const kioskI18n = createI18nConfig('kiosk-operator-ui', {
  vi: {
    'kiosk.title': 'Kiosk điều hành sản xuất',
    'kiosk.device': 'Thiết bị: {{terminalId}}',
    'kiosk.employee': 'Mã nhân viên / tên đăng nhập',
    'kiosk.password': 'Mật khẩu / mã PIN',
    'kiosk.login': 'Xác nhận đăng nhập ca',
    'kiosk.authenticating': 'Đang xác thực Direct Grant...',
  },
  en: {
    'kiosk.title': 'Production Operator Kiosk',
    'kiosk.device': 'Device: {{terminalId}}',
    'kiosk.employee': 'Employee code / username',
    'kiosk.password': 'Password / PIN',
    'kiosk.login': 'Confirm Shift Login',
    'kiosk.authenticating': 'Authenticating Direct Grant...',
  },
  ja: {
    'kiosk.title': '生産オペレーター Kiosk',
    'kiosk.device': '端末: {{terminalId}}',
    'kiosk.employee': '従業員コード / ユーザー名',
    'kiosk.password': 'パスワード / PIN',
    'kiosk.login': 'シフトログイン確認',
    'kiosk.authenticating': 'Direct Grant 認証中...',
  },
  ko: {
    'kiosk.title': '생산 작업자 Kiosk',
    'kiosk.device': '장치: {{terminalId}}',
    'kiosk.employee': '직원 코드 / 사용자 이름',
    'kiosk.password': '비밀번호 / PIN',
    'kiosk.login': '교대 로그인 확인',
    'kiosk.authenticating': 'Direct Grant 인증 중...',
  },
});
