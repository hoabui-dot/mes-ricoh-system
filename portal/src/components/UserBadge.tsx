interface UserBadgeProps {
  username: string;
  email: string;
  roleDisplay: string;
  onLogout: () => void;
}

export default function UserBadge({ username, email, roleDisplay, onLogout }: UserBadgeProps) {
  const initials = username
    .split('.')
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  return (
    <div className="user-badge">
      <div className="user-badge-info">
        <span className="user-badge-name">{username}</span>
        <span className="user-badge-role">{roleDisplay}</span>
      </div>
      <div className="user-badge-avatar" aria-label={`User: ${username} (${email})`}>
        {initials}
      </div>
      <button
        className="user-badge-logout"
        onClick={onLogout}
        id="logout-button"
        aria-label="Logout from all systems"
        title="Đăng xuất toàn hệ thống (Single Logout)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
