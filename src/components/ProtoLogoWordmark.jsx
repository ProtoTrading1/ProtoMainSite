import { useCallback, useState } from 'react';
import { PROTO_ICON_SOURCES } from '../lib/brandAssets';

/** Original icon + PROTO TRADING text + centred ONLINE row. */
export default function ProtoLogoWordmark({ height = 44, className = '' }) {
  const [iconIndex, setIconIndex] = useState(0);
  const [iconFailed, setIconFailed] = useState(false);

  const handleIconError = useCallback(() => {
    const next = iconIndex + 1;
    if (next < PROTO_ICON_SOURCES.length) {
      setIconIndex(next);
      return;
    }
    setIconFailed(true);
  }, [iconIndex]);

  const icon = iconFailed ? (
    <span className="proto-logo-wordmark__icon proto-logo-wordmark__icon--fallback" aria-hidden="true">
      &#937;
    </span>
  ) : (
    <img
      src={PROTO_ICON_SOURCES[iconIndex]}
      alt=""
      aria-hidden="true"
      className="proto-logo-wordmark__icon"
      decoding="async"
      onError={handleIconError}
    />
  );

  return (
    <span
      className={`proto-logo-wordmark ${className}`.trim()}
      style={{ '--logo-height': `${height}px` }}
      role="img"
      aria-label="Proto Trading Online"
    >
      <span className="proto-logo-wordmark__top">
        {icon}
        <span className="proto-logo-wordmark__copy">
          <strong className="proto-logo-wordmark__title">
            PROTO <span>TRADING</span>
          </strong>
          <span className="proto-logo-wordmark__online">
            <span className="proto-logo-wordmark__line" aria-hidden="true" />
            <small>ONLINE</small>
            <span className="proto-logo-wordmark__line" aria-hidden="true" />
          </span>
        </span>
      </span>
    </span>
  );
}
