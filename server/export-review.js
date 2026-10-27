// Export real view functions with isolated API fixtures for visual review only.
// This never reads the live merchant database and does not simulate live payment.
process.env.SCHA_ENV='test';process.env.SESSION_SECRET='isolated-visual-review-secret';
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {pathToFileURL}=require('node:url');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'scha-review-'));process.env.DB_PATH=path.join(tmp,'review.sqlite');
async function run(){
 const {createAppServer}=require('./index');const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let cookie='',csrf='';
 const get=async(route,body)=>{const res=await fetch(origin+route,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});for(const c of res.headers.getSetCookie())cookie+=(cookie?'; ':'')+c.split(';')[0];const d=await res.json();if(d.csrfToken)csrf=d.csrfToken;return d;};
 for(const file of ['state','storefront-views','admin-views'])fs.writeFileSync(path.join(tmp,file+'.mjs'),fs.readFileSync(path.join(__dirname,'../public',file+'.js'),'utf8').replaceAll("'./state.js'","'./state.mjs'"));
 const {state}=await import(pathToFileURL(path.join(tmp,'state.mjs')));const front=await import(pathToFileURL(path.join(tmp,'storefront-views.mjs')));const admin=await import(pathToFileURL(path.join(tmp,'admin-views.mjs')));
 state.storefront=await get('/api/storefront');await get('/api/cart');state.cart=(await get('/api/cart/demo-sandbox',{})).cart;
 const pages={Home:front.renderHomePage(),Shop:front.renderShopOrCollectionPage({}),Product:front.renderProductDetailPage(await get('/api/products/demo-product-01')),Bag:front.renderCartPage()};
 state.checkoutDraft.guestContinued=true;pages.Checkout=front.renderCheckoutPage();
 const auth=await get('/api/admin/auth/login',{email:'admin@shopbyscha.my',password:'SchaAdmin!2026'});state.user=auth.user;state.adminIncludeDemo=true;
 pages['Admin overview']=admin.renderAdminOverview(await get('/api/admin/overview?include_demo=1'));
 pages['Admin products']=admin.renderAdminProductsList((await get('/api/admin/products')).products);
 pages['Admin orders']=admin.renderAdminOrdersList((await get('/api/admin/orders')).orders);
 pages['Admin order detail']=admin.renderAdminOrderDetail((await get('/api/orders/SCHA-001')).order);
 pages['Admin payment review']=admin.renderAdminPaymentReviews((await get('/api/admin/payment-reviews')).orders);
 const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');
 const out=path.resolve(process.argv[2]||path.join(__dirname,'../review'));fs.mkdirSync(out,{recursive:true});
 const rendered={};for(const [name,html]of Object.entries(pages)){
   const body=html.replaceAll('src="/images/','src="https://shop-by-scha.vercel.app/images/').replaceAll('href="/images/','href="https://shop-by-scha.vercel.app/images/');
   const doc=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCHA code preview - ${name}</title><style>${css}</style></head><body><div id="drawer-root"></div><div id="app">${body}</div></body></html>`;
   const file=name.toLowerCase().replaceAll(' ','-')+'.html';fs.writeFileSync(path.join(out,file),doc);rendered[name]=doc;
 }
 const review=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shop by SCHA - visual code review</title><style>body{margin:0;background:#FBF8F5;color:#30282D;font:15px system-ui}header{padding:16px;border-bottom:1px solid #E8DDE1;display:flex;gap:14px;flex-wrap:wrap;align-items:center}select,button{padding:12px;border-radius:30px;border:1px solid #D77F9F;background:white;color:#8D3656}iframe{display:block;border:0;margin:auto;min-height:90vh;max-width:100%;background:white}</style></head><body><header><strong>Shop by SCHA / Visual code review</strong><select id="pages">${Object.keys(pages).map(n=>`<option>${n}</option>`).join('')}</select><select id="width"><option value="100%">Fit window</option>${[360,390,430,768,1024,1440].map(n=>`<option value="${n}px">${n}px</option>`).join('')}</select><span>Static snapshots from real code + isolated API test data. Run the project for cart, login and payment actions.</span></header><iframe id="view" title="Shop by SCHA rendered page"></iframe><script>const pages=${JSON.stringify(rendered).replaceAll('<','\\u003c')};const frame=document.getElementById('view');function show(){frame.srcdoc=pages[document.getElementById('pages').value];frame.style.width=document.getElementById('width').value;}document.querySelectorAll('select').forEach(s=>s.onchange=show);show();</script></body></html>`;
 fs.writeFileSync(path.join(out,'Shop_by_SCHA_Visual_Preview.html'),review);
 await new Promise(r=>server.close(r));await require('./db').db.close();fs.rmSync(tmp,{recursive:true,force:true});console.log('Rendered '+Object.keys(pages).length+' isolated view snapshots to '+out);
}
run().catch(e=>{console.error(e);process.exitCode=1;});
