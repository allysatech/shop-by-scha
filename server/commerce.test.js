const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scha-commerce-'));
process.env.DB_PATH = path.join(tmp, 'test.sqlite');
process.env.SCHA_ENV = 'test';
process.env.SESSION_SECRET = 'isolated-test-session-secret-not-for-production';
const { createAppServer } = require('./index');
let server, origin;
function client() {
  const jar = new Map(); let csrf;
  return { jar, async request(route, method='GET', body, extra={}) {
    const response = await fetch(origin+route, { method, headers: {
      Cookie: [...jar].map(([k,v])=>`${k}=${v}`).join('; '),
      ...(csrf ? {'X-CSRF-Token':csrf}:{}), ...(body ? {'Content-Type':'application/json'}:{}), ...extra
    }, ...(body ? {body:JSON.stringify(body)}:{}) });
    const cookies=response.headers.getSetCookie();
    for(const cookie of cookies){const [key,...v]=cookie.split(';')[0].split('=');jar.set(key,v.join('='));}
    const data=await response.json(); if(data.csrfToken)csrf=data.csrfToken;
    return {status:response.status,data,cookies};
  }};
}
before(async()=>{server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));await require('./db').db.close();fs.rmSync(tmp,{recursive:true,force:true});});
test('auth bootstrap does not race cart initialization by setting a second cart cookie',async()=>{
 const c=client();const me=await c.request('/api/auth/me');
 assert.equal(me.cookies.some(s=>s.startsWith('scha_cart=')),false);
});
test('guest cart survives both checkout reads, refresh, quantity edit and removal',async()=>{
 const c=client();await c.request('/api/cart');const added=await c.request('/api/cart/demo-sandbox','POST',{});
 assert.equal(added.data.cart.itemCount,1);
 for(const route of ['/api/cart','/api/cart?state=Selangor','/api/cart'])assert.equal((await c.request(route)).data.itemCount,1);
 const item=added.data.cart.items[0];
 assert.equal((await c.request(`/api/cart/items/${item.cart_item_id}`,'PATCH',{quantity:2})).data.cart.itemCount,2);
 assert.equal((await c.request(`/api/cart/items/${item.cart_item_id}`,'PATCH',{quantity:1.5})).status,400);
 assert.equal((await c.request(`/api/cart/items/${item.cart_item_id}`,'DELETE')).data.cart.itemCount,0);
});
test('customer login merges a guest bag into the previous customer bag',async()=>{
 const c=client();await c.request('/api/cart');await c.request('/api/cart/demo-sandbox','POST',{});
 const login={email:'customer@example.com',password:'Customer!2026'};
 assert.equal((await c.request('/api/auth/login','POST',login)).status,200);
 await c.request('/api/auth/logout','POST',{});c.jar.delete('scha_cart');
 await c.request('/api/cart');await c.request('/api/cart/demo-sandbox','POST',{});
 await c.request('/api/auth/login','POST',login);
 assert.equal((await c.request('/api/cart')).data.itemCount,2);
});
test('a customer cart token cannot be used by a different customer or guest',async()=>{
 const c=client();await c.request('/api/cart');await c.request('/api/cart/demo-sandbox','POST',{});
 await c.request('/api/auth/login','POST',{email:'customer@example.com',password:'Customer!2026'});
 const token=c.jar.get('scha_cart');const intruder=client();
 const result=await intruder.request('/api/cart','GET',null,{'X-Cart-Token':token});
 assert.equal(result.data.itemCount,0);
});
test('repeated order submission returns the same order without a second reservation',async()=>{
 const c=client();await c.request('/api/cart');await c.request('/api/cart/demo-sandbox','POST',{});
 const payload={idempotency_key:'regression-repeated-order',email:'test@example.com',phone:'0123456789',shipping_address:{recipient_name:'Test Buyer',line1:'Test address',postcode:'43000',city:'Kajang',state:'Selangor'}};
 const one=await c.request('/api/checkout/place-order','POST',payload);assert.equal(one.status,201);
 const two=await c.request('/api/checkout/place-order','POST',payload);assert.equal(two.status,200);
 assert.equal(two.data.order.order_number,one.data.order.order_number);
 const stranger=client();assert.equal((await stranger.request(`/api/orders/${one.data.order.order_number}`)).status,403);
});
test('a product cannot be published with missing merchant model, description and lead time',async()=>{
 const a=client();await a.request('/api/admin/auth/login','POST',{email:'admin@shopbyscha.my',password:'SchaAdmin!2026'});
 const list=await a.request('/api/admin/products');const p=list.data.products.find(p=>p.reference_id==='REF-01');
 const result=await a.request(`/api/admin/products/${p.id}`,'PUT',{price_myr:'100',sellable_sku:'TEST-PUBLISH',stock_quantity:5,publish_status:'published'});
 assert.equal(result.status,400);
});
test('two buyers cannot reserve the same last item, and concurrent retries create one order',async()=>{
 const {db}=require('./db');
 await db.prepare("UPDATE product_variants SET on_hand=1,reserved=0 WHERE sku='SCHA-001-A'").run();
 const a=client(),b=client();for(const c of [a,b]){await c.request('/api/cart');await c.request('/api/cart/demo-sandbox','POST',{});}
 const payload={idempotency_key:'last-item-checkout-one',email:'race@example.com',phone:'0123456789',shipping_address:{recipient_name:'Test Buyer',line1:'Test only',postcode:'43000',city:'Kajang',state:'Selangor'}};
 const results=await Promise.all([a.request('/api/checkout/place-order','POST',payload),b.request('/api/checkout/place-order','POST',{...payload,idempotency_key:'last-item-checkout-two'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
 const winner=results[0].status===201?a:b;const winningKey=results[0].status===201?payload.idempotency_key:'last-item-checkout-two';
 const retries=await Promise.all([winner.request('/api/checkout/place-order','POST',{...payload,idempotency_key:winningKey}),winner.request('/api/checkout/place-order','POST',{...payload,idempotency_key:winningKey})]);
 assert.equal(retries[0].data.order.id,retries[1].data.order.id);
 assert.equal((await db.prepare("SELECT reserved FROM product_variants WHERE sku='SCHA-001-A'").get()).reserved,1);
});
test('email retry without transport stays queued and never claims delivery',async()=>{
 const a=client();await a.request('/api/admin/auth/login','POST',{email:'admin@shopbyscha.my',password:'SchaAdmin!2026'});
 const result=await a.request('/api/admin/notifications/1/retry','POST',{});
 assert.equal(result.status,200);assert.equal(result.data.job.status,'pending_smtp');assert.equal(result.data.job.provider_message_id,null);
});
test('merchant can complete a draft, publish confirmed variants and buy the selected variant',async()=>{
 const a=client();await a.request('/api/admin/auth/login','POST',{email:'admin@shopbyscha.my',password:'SchaAdmin!2026'});
 const created=await a.request('/api/admin/products','POST',{title:'Isolated test product',slug:'isolated-test-product',brand:'TEST ONLY',category_slug:'bags',sellable_sku:'ISOLATED-BASE',price_myr:'10',stock_quantity:3,publish_status:'draft',image_path:'/images/06_jacquemus_pink_top_handle_bag.png'});
 assert.equal(created.status,201);const p=created.data.product;
 const variants=[{id:p.variants[0].id,sku:'ISOLATED-BASE',title:'Test pink',attributes:{colour:'Pink'},price_minor:1000,on_hand:3,is_active:true,version:p.variants[0].version},{sku:'ISOLATED-ALT',title:'Test alternative',attributes:{colour:'Test alternative'},price_minor:1200,on_hand:2,is_active:true}];
 const published=await a.request(`/api/admin/products/${p.id}`,'PUT',{model:'ISOLATED-MODEL',description:'Product data exclusively for automated tests.',shipping_returns_note:'Isolated test dispatch estimate',stock_type:'ready_stock',publish_status:'published',variants});
 assert.equal(published.status,200);assert.equal(published.data.product.is_sellable,true);assert.equal(published.data.product.variants.length,2);
 const buyer=client();await buyer.request('/api/cart');const alt=published.data.product.variants.find(v=>v.sku==='ISOLATED-ALT');
 const added=await buyer.request('/api/cart/items','POST',{product_id:p.id,variant_id:alt.id,quantity:2});
 assert.equal(added.status,200);assert.equal(added.data.cart.subtotal_minor,2400);assert.equal(added.data.cart.items[0].variant_title,'Test alternative');
 assert.equal((await buyer.request('/api/cart/items','POST',{product_id:p.id,variant_id:alt.id,quantity:1})).status,400);
});
