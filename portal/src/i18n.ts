import { createI18nConfig } from '@mom-platform/i18n-ui-shared';

export const portalI18n = createI18nConfig('portal', {
  vi: {
    'portal.hello': 'Xin chào, {{username}}',
    'portal.choose': 'Chọn hệ thống bạn muốn làm việc hôm nay',
    'portal.noAccess': 'Không có quyền truy cập',
    'portal.noAccessBody': 'Tài khoản của bạn chưa được cấp quyền vào hệ thống nào. Liên hệ quản trị viên.',
    'portal.redirecting': 'Đang chuyển đến hệ thống...',
    'portal.operational': 'Tất cả hệ thống đang hoạt động',
  },
  en: {
    'portal.hello': 'Hello, {{username}}',
    'portal.choose': 'Choose the system you want to work with today',
    'portal.noAccess': 'No access',
    'portal.noAccessBody': 'Your account has not been granted access to any system. Contact an administrator.',
    'portal.redirecting': 'Redirecting to the system...',
    'portal.operational': 'All systems operational',
  },
  ja: {
    'portal.hello': 'こんにちは、{{username}}',
    'portal.choose': '本日利用するシステムを選択してください',
    'portal.noAccess': 'アクセス権限がありません',
    'portal.noAccessBody': 'このアカウントには利用可能なシステム権限がありません。管理者に連絡してください。',
    'portal.redirecting': 'システムへ移動しています...',
    'portal.operational': 'すべてのシステムは稼働中です',
  },
  ko: {
    'portal.hello': '안녕하세요, {{username}}',
    'portal.choose': '오늘 사용할 시스템을 선택하세요',
    'portal.noAccess': '접근 권한 없음',
    'portal.noAccessBody': '이 계정에는 접근 가능한 시스템 권한이 없습니다. 관리자에게 문의하세요.',
    'portal.redirecting': '시스템으로 이동 중...',
    'portal.operational': '모든 시스템 정상 운영 중',
  },
});
