import { ArrowRight, ChevronRight } from 'lucide-react';

function Count({ value }) {
  if (value == null) return null;
  return <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '700' }}>{value}</span>;
}

export default function MegaMenu({ l1Node, navigate, counts, onClose }) {
  if (!l1Node) return null;

  const countFor = (path) => counts?.[path.join('/')] ?? null;
  const go = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 'calc(100% + 8px)',
        top: 12,
        width: 380,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 18,
        boxShadow: '0 24px 55px rgba(15, 23, 42, 0.14)',
        padding: 18,
        zIndex: 300,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Category menu
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 22, lineHeight: 1.05, color: '#111827', fontFamily: 'Outfit, sans-serif', margin: 0 }}>
              {l1Node.label}
            </h3>
            <p style={{ marginTop: 6, color: '#64748B', fontSize: 13 }}>
              Keep it simple — choose the section you want, then browse the products.
            </p>
          </div>
          <Count value={countFor([l1Node.id])} />
        </div>
        <button
          type="button"
          onClick={() => go([l1Node.id])}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '12px 14px', borderRadius: 12,
            border: '1px solid #fecdd3', background: '#fff5f7', color: '#be123c', fontWeight: 800,
          }}
        >
          <span>Shop all {l1Node.label}</span>
          <ArrowRight size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(l1Node.children || []).map((group) => (
          <section key={group.id} style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: 14, background: '#fff' }}>
            <button
              type="button"
              onClick={() => go([l1Node.id, group.id])}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                textAlign: 'left', padding: 0, color: '#111827', fontWeight: 800,
              }}
            >
              <span>{group.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Count value={countFor([l1Node.id, group.id])} />
                <ChevronRight size={16} color="#D1D5DB" />
              </div>
            </button>

            {!!group.children?.length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {group.children.map((child) => (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => go([l1Node.id, group.id, child.id])}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                        padding: '10px 12px', borderRadius: 10, background: '#f8fafc', color: '#334155', fontWeight: 700,
                        textAlign: 'left',
                      }}
                    >
                      <span>{child.label}</span>
                      <Count value={countFor([l1Node.id, group.id, child.id])} />
                    </button>

                    {!!child.children?.length && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {child.children.map((leaf) => (
                          <button
                            key={leaf.id}
                            type="button"
                            onClick={() => go([l1Node.id, group.id, child.id, leaf.id])}
                            style={{
                              padding: '8px 10px', borderRadius: 999,
                              border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700,
                            }}
                          >
                            {leaf.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
