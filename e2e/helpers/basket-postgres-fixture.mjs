import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';

// Runs in the isolated Playwright child only. Everything written by SQL is in
// a fresh process-memory PostgreSQL instance; no socket or data files.
assert.ok(process.send, 'Start this fixture through Playwright IPC');
assert.ok(process.env.FIXTURE_AUTH_TOKEN, 'Missing synthetic fixture token');
const source = new URL('../../', import.meta.url);
function checkedFile(name, hash) {
  const bytes = readFileSync(new URL(name, source));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  return bytes;
}
const portal = 'https://basket-portal.example.invalid';
const stock = 'https://basket-stock.example.invalid';
process.env.VITE_SUPABASE_URL = portal;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-no-provider-key';
process.env.VITE_STOCK_SUPABASE_URL = stock;
process.env.VITE_STOCK_SUPABASE_KEY = 'fixture-no-stock-key';
process.env.BREVO_API_KEY = 'fixture-non-credential-required-by-handler';
process.env.VERCEL_ENV = 'development';

const user = { id: '00000000-0000-4000-8000-000000000210', email: 'accessibility-e2e@example.invalid' };
const bearer = 'Bearer ' + process.env.FIXTURE_AUTH_TOKEN;
const jwtPayload = JSON.parse(Buffer.from(process.env.FIXTURE_AUTH_TOKEN.split('.')[1], 'base64url').toString());
assert.equal(jwtPayload.sub, user.id);
assert.equal(jwtPayload.email, user.email);
const db = await PGlite.create();
const setupSql = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}',email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`;
await db.exec(setupSql);
// Pin the two exact #311 handlers and their boundary helpers. The shallow CI
// checkout need not contain the parent commit to verify these payloads.
for (const [file, hash] of [
  ['api/account-cart.js', '87b0e3fb6816895c52ccc47317fada9295cb9c92fd696123cc211d969ff4c285'],
  ['api/send-order.js', 'fdae934cb580ce945b426abc3b7990bdf149e8b7e7411c83270b9472a4d733dc'],
  ['api/_auth.js', '4357c812bd63adb2496c8a753e14cc20bf0a711e7c2dbc990408b37b42a81e68'],
  ['api/_order-replay.js', 'fa6e0c0ec101994f32dd542c5862c3c6301ac4461a44d9ff091a191c90ef4d3e'],
  ['lib/stock-supabase.mjs', '8255a4a64f20477622cb1cba45af091919cb8085444f2c84da63f6e72b2b64d2'],
]) checkedFile(file, hash);
for (const [file, hash] of [
  ['migrations/001_initial.sql', '09f3c6ff6f56e134627988f95fb0d298469e01ca584f608a3a6211b6a2f9545e'],
  ['migrations/003_admin_workflows.sql', '89c1211b2c16236ac405fc2ffdf9c17c0852c30da66a0984349738e2a0b033e5'],
  ['migrations/004_trade_request_fields.sql', 'd4ee39799b40a2188472d82f051ac0324bc1548edc3366908a4370aa0bb8ce35'],
  ['migrations/017_order_number_sequence.sql', '85ed3ea00367a3052101da0ba353023243e3783bcb918b34988bd389baeadead'],
  ['migrations/021_proto_active_customers.sql', '202f6fadb2900abcc3e5b6d0948849312dcc5d7398cfa588e106507cae48a3bb'],
  ['migrations/024_orders_delivery_method.sql', 'cb79b35640d47b418093a9139666663985b3cd164b99b2bd32ddda6d81f6adcf'],
  ['migrations/030_orders_client_ref.sql', '36ece23805ec9592498ea0c0f5a4fe8a4444c0856b15367dad6b4e0f0e1def53'],
  ['migrations/033_move_admin_helper_out_of_public_api.sql', 'fab18f51bd220054f4f76c2224cc6db54b375e14d88144f3e65b63ff78767da8'],
  ['migrations/034_server_only_customer_order_creation.sql', '50fd1e039736918cf9cda7a75f5306d554eaf1f6cd95eaacdd0483cc7c3d17de'],
  ['migrations/057_customer_account_cart.sql', '57f43163abd0d0df5dda6b5ad78173d1afc1aaf57aa28e202af1b5bfe65c25c7'],
  ['migrations/058_order_delivery_safety.sql', '44d908193465837975242e2942fd20d15392888c7161bea01d88798c188fcaa3'],
  ['supabase/migrations/20261003092259_order_replay_delivery_integrity.sql', 'cb152c9ae296fb3d21f45806cc380d44cd82aedd33db43b0985b647f75b02f2a'],
  ['supabase/migrations/20261003092306_customer_privilege_and_mailbox_security.sql', 'a88e7983a5a6a310dd4c7218e75ae71632ce667e444659047f0831b925cbda99'],
]) {
  try { await db.exec(checkedFile(file, hash).toString()); }
  catch (error) { throw Error('Fixture migration ' + file + ': ' + error.message, { cause: error }); }
}
await db.exec("grant usage on schema public to service_role; grant select, insert, update on public.customers, public.orders to service_role; grant select on public.proto_active_customers to service_role; grant usage on sequence public.order_number_seq to service_role;");
await db.query('insert into auth.users (id,email) values ($1,$2)', [user.id, user.email]);
await db.exec('set role service_role;');
await db.query("update public.customers set is_approved=true,business_name='Synthetic Checkout' where id=$1", [user.id]);
const query=async (sql,params)=> (await db.query(sql,params)).rows;
const write=async (mode,table,data,where=[],values=[])=>{
  const allowed = table==='orders'
    ? new Set('customer_id checkout_request_hash checkout_notification_snapshot items original_items final_items order_match total_ex_vat delivery_method customer_notes order_change_notes client_ref'.split(' '))
    : new Set('customer_id items activity_at revision updated_at'.split(' '));
  const entries=Object.entries(data);
  assert.ok(entries.every(([k])=>allowed.has(k)));
  let i=values.length;
  const col=entries.map(([k])=>k).join(',');
  const vals=entries.map(()=>'$'+(++i));
  const sql=mode==='insert'
    ? 'insert into public.'+table+' ('+col+') values ('+vals.join(',')+') returning *'
    : 'update public.'+table+' set '+entries.map(([k],n)=>k+'='+vals[n]).join(',')+' where '+where.join(' and ')+' returning *';
  const mapped=entries.map(([k,v])=>['items','original_items','final_items','checkout_notification_snapshot'].includes(k)?JSON.stringify(v):v);
  return query(sql,[...values,...mapped]);
};
const escapes = [];
let deniedDeliveryClaims=0;
const productRow = {sku:'SYNTHETIC-BLUE',barcode:'1234567890123',title:'Verified synthetic notebook blue',price:400,stock_qty:1,available_stock:1,units_of_issue:'EACH',min_order_qty:1,to_order:false};
const redRow={...productRow,sku:'SYNTHETIC-RED',title:'Verified synthetic notebook red',price:300};
function json(body,status=200) { return new Response(JSON.stringify(body), { status,headers:{'Content-Type':'application/json'} }); }
function filtered(rows,url) {
  return rows.filter(row=>[...url.searchParams].every(([k,v])=>['select','limit','offset','order'].includes(k) || (
    v.startsWith('eq.') ? String(row[k]) === v.slice(3) : v.startsWith('in.(') ? v.slice(4,-1).split(',').map(s=>s.replaceAll('"','')).includes(String(row[k])) : false
  )));
}
globalThis.fetch = async (input,init={}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const body = init.body == null ? null : JSON.parse(init.body);
  function rows(data) {
    return json(headers.get('accept')?.includes('vnd.pgrst.object') ? data[0] ?? null : data);
  }
  if (url.origin === portal) {
    if (method==='GET' && url.pathname==='/auth/v1/user') {
      return headers.get('authorization')===bearer ? json(user) : json({message:'Unauthorized'},401);
    }
    if (method==='GET' && url.pathname==='/rest/v1/customers') return rows(await query('select * from public.customers where id=$1',[url.searchParams.get('id').slice(3)]));
    if (method==='GET' && url.pathname==='/rest/v1/proto_active_customers') return rows(await query('select * from public.proto_active_customers where email=$1',[url.searchParams.get('email').slice(3)]));
    try {
      if (url.pathname==='/rest/v1/customer_account_carts') {
        const customer = url.searchParams.get('customer_id')?.slice(3);
        if (method==='GET') return rows(await query('select * from public.customer_account_carts where customer_id=$1',[customer]));
        if (method==='POST' && body.customer_id===user.id) return rows(await write('insert','customer_account_carts',body));
        if (method==='PATCH') return rows(await write('update','customer_account_carts',body,['customer_id=$1','revision=$2'],[customer,url.searchParams.get('revision').slice(3)]));
      }
      if (url.pathname==='/rest/v1/orders') {
        if (method==='GET') return rows(await query('select * from public.orders where customer_id=$1 and client_ref=$2',[url.searchParams.get('customer_id').slice(3),url.searchParams.get('client_ref').slice(3)]));
        if (method==='POST' && body[0]?.customer_id===user.id) return rows(await write('insert','orders',body[0]));
      }
    } catch(e) {
      if(e.code==='23505') return json({code:e.code,message:e.message},409);
      throw e;
    }
    if (method==='POST' && url.pathname==='/rest/v1/rpc/order_delivery_schema_readiness')
      return json((await query('select public.order_delivery_schema_readiness() as ready'))[0].ready);
    if (method==='POST' && url.pathname==='/rest/v1/rpc/order_replay_schema_readiness')
      return json((await query('select public.order_replay_schema_readiness() as ready'))[0].ready);
    if (method==='POST' && url.pathname==='/rest/v1/rpc/claim_storefront_order_delivery') {
      assert.equal((await query('select count(*)::int as n from public.order_delivery_jobs where order_id=$1 and channel=$2 and status=$3',[body.p_order_id,body.p_channel,'pending']))[0].n,1);
      deniedDeliveryClaims++;
      return json({claimed:false, reason:'Notifications disabled in isolated rehearsal'});
    }
  }
  if (url.origin===stock) {
    if (method==='GET' && url.pathname==='/rest/v1/website_stock') return rows(filtered([productRow,redRow],url));
    if (method==='GET' && url.pathname==='/rest/v1/extended_range_items') return rows([]);
    if (method==='POST' && url.pathname==='/rest/v1/rpc/get_website_product_availability') return json([]);
  }
  escapes.push(method+' '+url.origin+url.pathname);
  throw Error('Blocked unexpected fetch: '+escapes.at(-1));
};

const importer = name=>import(new URL(name, source).href);
const { default: accountCart } = await importer('api/account-cart.js');
const { createSendOrderHandler } = await importer('api/send-order.js');
let notifierInvocations=0;
const noNotifier=()=>{ notifierInvocations++; throw Error('Local safety assertion: notification handler called'); };
const orderHandler = createSendOrderHandler({
  // Keep authentication, PostgREST, authoritative-price/stock resolution, capture and replay real.
  resolveOrderNotifyRecipients: ()=>[],
  prepareItems: async items=>items,
  buildPdfBuffer: async ()=>Buffer.from('synthetic PDF, never delivered'),
  buildOrderPdfBuffer: noNotifier,
  sendTeamEmailWithRetry: noNotifier,
  sendCustomerOrderAck: noNotifier,
  runOrderTeamNotify: noNotifier,
  readOrderNotifyLog: async ()=>null,
  saveOrderNotifyLog: async ()=>{},
});
async function invoke({ path, method, authorization, body }) {
  assert.equal(authorization, bearer);
  const handler = path === '/api/account-cart' && ['GET', 'PUT', 'DELETE'].includes(method)
    ? accountCart : path === '/api/send-order' && method === 'POST' ? orderHandler : null;
  assert.ok(handler, 'Rejected fixture handler or method');
  const req = { method, headers: { host: '127.0.0.1', authorization }, body };
  const res = {
    statusCode: 200, setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body };
}

process.on('message', async ({ id, operation, payload }) => {
  try {
    let value;
    if (operation === 'invoke') value = await invoke(payload);
    else if (operation === 'receipt') {
      value = {
        orders: await query('select id,order_number,client_ref,items,checkout_request_hash from public.orders'),
        jobs: await query('select channel,source,status,attempt_count from public.order_delivery_jobs order by channel'),
        deniedDeliveryClaims, notifierInvocations, blockedOutbound: [...escapes],
      };
    } else if (operation === 'close') {
      await db.close();
      process.send({ id, value: true }, () => process.disconnect());
      return;
    } else throw Error('Unknown fixture IPC operation');
    process.send({ id, value });
  } catch (error) {
    process.send({ id, error: error.message });
  }
});
process.send({ ready: true });
