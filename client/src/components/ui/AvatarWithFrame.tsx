interface AvatarWithFrameProps {
  avatarSrc?: string | null;
  frameSrc?: string | null;
  initials?: string;
  initialsColor?: string;
  size: number;
  onClick?: () => void;
}

export function AvatarWithFrame({ avatarSrc, frameSrc, initials, initialsColor, size, onClick }: AvatarWithFrameProps) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'visible',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {/* Avatar background circle */}
      <div style={{
        position: 'absolute',
        inset: '12%',
        borderRadius: '50%',
        overflow: 'hidden',
        background: frameSrc ? 'rgba(0,0,0,0.6)' : 'rgba(245,158,11,0.16)',
        border: frameSrc ? 'none' : '2px solid rgba(245,158,11,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}>
        {avatarSrc ? (
          <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontWeight: 700, fontSize: size * 0.28, color: initialsColor ?? '#F0B829', fontFamily: 'monospace' }}>{initials}</span>
        )}
      </div>

      {/* Frame overlay */}
      {frameSrc && (
        <img
          src={frameSrc}
          alt="frame"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}
    </div>
  );
}
