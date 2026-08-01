import { useCallback, useMemo, useState } from 'react';
import {
  PROTO_BRAND_NAME,
  PROTO_ICON_SOURCES,
  PROTO_LOGO_SOURCES,
  PROTO_TAGLINE,
} from '../lib/brandAssets';
import ProtoLogoWordmark from './ProtoLogoWordmark';
import './ProtoLogo.css';

const SIZE_HEIGHT = {
  sm: 28,
  md: 36,
  lg: 44,
  xl: 52,
};

function nextSource(sources, index) {
  return index + 1 < sources.length ? index + 1 : -1;
}

function ProtoLogoFallback({ variant, size, tagline, className, style }) {
  const height = typeof size === 'number' ? size : (SIZE_HEIGHT[size] ?? SIZE_HEIGHT.md);
  const showTagline = tagline !== false;
  const taglineText = tagline === true || tagline == null ? PROTO_TAGLINE : tagline;
  if (variant === 'icon') {
    return (
      <span
        className={`proto-logo proto-logo--icon-fallback ${className ?? ''}`.trim()}
        style={{ ...style, width: height, height }}
        aria-label={PROTO_BRAND_NAME}
        role="img"
      >
        <span className="proto-logo__mark" aria-hidden="true">&#937;</span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <span className={`proto-logo proto-logo--compact-fallback ${className ?? ''}`.trim()} style={style}>
        <span className="proto-logo__mark proto-logo__mark--compact" aria-hidden="true">&#937;</span>
        <span className="proto-logo__text">
          <strong>PROTO <span>TRADING</span></strong>
          {showTagline && <small>{taglineText}</small>}
        </span>
      </span>
    );
  }

  return (
    <span className={`proto-logo proto-logo--full-fallback ${className ?? ''}`.trim()} style={style}>
      <ProtoLogoWordmark height={height} />
    </span>
  );
}

export default function ProtoLogo({
  variant = 'full',
  size = 'md',
  tagline = PROTO_TAGLINE,
  className = '',
  style,
  imgClassName = '',
  imgStyle,
  sources,
  onClick,
  role,
  tabIndex,
  preferImage = false,
}) {
  const sourceList = useMemo(() => {
    if (sources) return sources;
    if (variant === 'icon' || variant === 'compact') return PROTO_ICON_SOURCES;
    return PROTO_LOGO_SOURCES;
  }, [sources, variant]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  const height = typeof size === 'number' ? size : (SIZE_HEIGHT[size] ?? SIZE_HEIGHT.md);
  const showTagline = tagline !== false && variant !== 'icon';

  const handleError = useCallback(() => {
    const next = nextSource(sourceList, sourceIndex);
    if (next >= 0) {
      setSourceIndex(next);
      setImageReady(false);
      return;
    }
    setFailed(true);
    setImageReady(false);
  }, [sourceIndex, sourceList]);

  if (variant === 'full' && !preferImage) {
    return (
      <span
        className={`proto-logo proto-logo--full ${className}`.trim()}
        style={style}
        onClick={onClick}
        role={role}
        tabIndex={tabIndex}
      >
        <ProtoLogoWordmark height={height} className={`proto-logo__svg ${className}`.trim()} />
      </span>
    );
  }

  if (failed) {
    return (
      <ProtoLogoFallback
        variant={variant}
        size={size}
        tagline={tagline}
        className={className}
        style={style}
      />
    );
  }

  const src = sourceList[sourceIndex];
  const alt = variant === 'icon' ? PROTO_BRAND_NAME : '';

  if (variant === 'full') {
    return (
      <span
        className={`proto-logo proto-logo--full ${className}`.trim()}
        style={style}
        onClick={onClick}
        role={role}
        tabIndex={tabIndex}
      >
        {imageReady ? (
          <img
            src={src}
            alt={PROTO_BRAND_NAME}
            className={`proto-logo__image proto-logo__image--full ${imgClassName}`.trim()}
            style={{ height, ...imgStyle }}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <>
            <ProtoLogoWordmark height={height} className="proto-logo__svg" />
            <img
              src={src}
              alt=""
              aria-hidden="true"
              className={`proto-logo__image proto-logo__image--full proto-logo__image--probe ${imgClassName}`.trim()}
              style={{ display: 'none', ...imgStyle }}
              loading="eager"
              decoding="async"
              onLoad={() => setImageReady(true)}
              onError={handleError}
            />
          </>
        )}
      </span>
    );
  }

  if (variant === 'icon') {
    return (
      <span
        className={`proto-logo proto-logo--icon ${className}`.trim()}
        style={{ ...style, width: height, height }}
        onClick={onClick}
        role={role ?? 'img'}
        tabIndex={tabIndex}
        aria-label={PROTO_BRAND_NAME}
      >
        <img
          src={src}
          alt={alt}
          className={`proto-logo__image proto-logo__image--icon ${imgClassName}`.trim()}
          style={imgStyle}
          decoding="async"
          onError={handleError}
        />
      </span>
    );
  }

  // compact: icon image + text fallback layout when image fails entirely
  return (
    <span
      className={`proto-logo proto-logo--compact ${className}`.trim()}
      style={style}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
    >
      <span className="proto-logo__icon-wrap" style={{ width: height, height }}>
        {!failed && (
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className={`proto-logo__image proto-logo__image--compact ${imgClassName}`.trim()}
            style={imgStyle}
            decoding="async"
            onError={handleError}
          />
        )}
      </span>
      <span className="proto-logo__text">
        <strong>PROTO <span>TRADING</span></strong>
        {showTagline && (
          <small>{tagline === true || tagline == null ? PROTO_TAGLINE : tagline}</small>
        )}
      </span>
    </span>
  );
}

export { PROTO_BRAND_NAME, PROTO_ICON_SOURCES, PROTO_LOGO_SOURCES, PROTO_TAGLINE };
