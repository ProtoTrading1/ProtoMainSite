import { 
  Briefcase, Scissors, ToyBrick, Package, Home, Wrench, 
  PenTool, Smile, Shirt, Cookie, Wind, Utensils, Lock 
} from 'lucide-react';

const cats = [
  { Icon: Briefcase, name: 'Bags, Wallets & Accessories',  subs: 'Handbags, Travel Bags, Components',   count: '950+' },
  { Icon: Scissors,  name: 'Beads, Jewellery & Accessories', subs: 'Glass, Wood, Plastic, Findings',     count: '1,500+' },
  { Icon: ToyBrick,  name: 'Toys, Games & Novelty',      subs: 'Educational, Outdoor, Plush, Novelty', count: '800+' },
  { Icon: Package,   name: 'Packaging',                  subs: 'Bags, Boxes, Tape, Labels',          count: '450+' },
  { Icon: Home,      name: 'Homeware & Kitchen',         subs: 'Kitchenware, Decor, Organisation',   count: '600+' },
  { Icon: Wrench,    name: 'Hardware',                    subs: 'Tools, Fixings, Electrical',         count: '350+' },
  { Icon: PenTool,   name: 'Arts, Crafts & Stationery',  subs: 'Pens, Notebooks, Art & Craft Supplies', count: '500+' },
  { Icon: Smile,     name: 'Beauty & Personal Care',      subs: 'Skin Care, Makeup, Tools, Hygiene',  count: '700+' },
  { Icon: Shirt,     name: 'Fashion & Accessories',       subs: 'Belts, Scarves, Hats, Fashion Jewellery', count: '400+' },
  { Icon: Cookie,    name: 'Confectionery',              subs: 'Sweets, Candy, Chocolates, Snacks',  count: '250+' },
  { Icon: Wind,      name: 'Textiles',                   subs: 'Fabrics, Yarn, Haberdashery',        count: '300+' },
  { Icon: Utensils,  name: 'Events, Parties & Hospitality', subs: 'Party Supplies, Decor, Amenities', count: '500+' },
];

export default function CategoryTeaser() {
  return (
    <section id="categories" className="section-padding" style={{ backgroundColor: 'var(--bg-main)' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h2 style={{ 
            fontSize: 'clamp(32px, 4vw, 42px)', 
            fontWeight: '800', 
            color: 'var(--text-primary)', 
            letterSpacing: '-1px', 
            marginBottom: '16px',
            fontFamily: 'Outfit'
          }}>
            Extensive B2B Product Range
          </h2>
          <p style={{ 
            fontSize: '18px', 
            color: 'var(--text-secondary)', 
            maxWidth: '640px', 
            margin: '0 auto', 
            lineHeight: 1.7,
            fontWeight: '500'
          }}>
            Explore our curated selection of wholesale categories available exclusively to approved trade customers.
          </p>
        </div>

        <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          {cats.map(({ Icon, name, subs, count }) => (
            <div key={name} className="category-card">
              <div className="category-icon-wrapper">
                <Icon size={24} color="var(--proto-red)" />
              </div>
              <h3 style={{ 
                fontSize: '18px', 
                fontWeight: '700', 
                color: 'var(--text-primary)', 
                marginBottom: '8px',
                fontFamily: 'Outfit'
              }}>{name}</h3>
              <p style={{ 
                fontSize: '14px', 
                color: 'var(--text-secondary)', 
                lineHeight: 1.6, 
                marginBottom: '24px',
                minHeight: '44px'
              }}>{subs}</p>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-light)'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{count} Lines</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  <Lock size={12} /> <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trade Only</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

