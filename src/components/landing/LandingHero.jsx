import { CheckCircle2 } from 'lucide-react';

// The two ways onto the portal, asked as a question rather than stated as a
// banner. During the re-register campaign the most expensive misunderstanding
// is a previous customer trying their old login and giving up, so that case
// gets its own card, its own explanation and the accented border.
const ENTRY_CHOICES = [
  {
    id: 'returning',
    heading: 'Registered on our old website?',
    detail: ['Your old login will not work here.', 'Please register again for online access.'],
    action: 'Register again',
    emphasis: true,
  },
  {
    id: 'new',
    heading: 'New to Proto Trading online?',
    detail: [],
    action: 'Apply for online access',
    emphasis: false,
  },
];

// Sets expectations before anyone applies: an online account is not an account
// at the physical store.
const APPROVAL_NOTE = 'Online approval is for purchasing on Proto Trading Online only. '
  + 'It does not create an account at our physical store.';

export default function LandingHero({ onApply }) {
  return (
    <section className="vhero-section vhero-section--static vhero-section--choices">
      <div className="vhero-copy">
        <h1 className="vhero-headline" aria-label="Welcome to Proto Trading Online">
          <span className="vhero-headline-line">WELCOME TO</span>
          <span className="vhero-headline-line">PROTO TRADING</span>
          <span className="vhero-headline-line vhero-headline-line--accent">ONLINE</span>
        </h1>

        <div className="vhero-choices">
          <h2 className="vhero-choices-title">What would you like to do?</h2>

          {ENTRY_CHOICES.map(({ id, heading, detail, action, emphasis }) => (
            <div
              key={id}
              className={`vhero-choice${emphasis ? ' vhero-choice--emphasis' : ''}`}
            >
              <div className="vhero-choice-copy">
                <h3 className="vhero-choice-heading">{heading}</h3>
                {detail.length > 0 && (
                  <p className="vhero-choice-detail">
                    {detail.map((line) => (
                      <span key={line} className="vhero-choice-line">{line}</span>
                    ))}
                  </p>
                )}
              </div>
              {/* Both routes lead to the same application form — re-registering
                  and applying are one process on the new portal. */}
              <button className="access-apply vhero-choice-action" type="button" onClick={onApply}>
                {action}
              </button>
            </div>
          ))}

          <p className="vhero-approval-note">{APPROVAL_NOTE}</p>
        </div>

        <div className="vhero-trust-strip" role="list" aria-label="Wholesale platform highlights">
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>5,000+ PRODUCTS</strong>
              <span>One supplier for your business.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>REAL-TIME STOCK</strong>
              <span>Live inventory, always up to date.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>EXCLUSIVE TRADE PRICING</strong>
              <span>Wholesale pricing for approved customers.</span>
            </div>
          </div>
          <div className="vhero-trust-item" role="listitem">
            <CheckCircle2 size={15} />
            <div>
              <strong>FAST REORDERING</strong>
              <span>Buy your favourites again in seconds.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
