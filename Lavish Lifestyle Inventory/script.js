
const DATA_KEY = 'mate_demo_v1';

async function loadInitialData(){
  if(!localStorage.getItem(DATA_KEY)){
    const r = await fetch('/assets/data/data.json');
    const j = await r.json();
    localStorage.setItem(DATA_KEY, JSON.stringify(j));
    return j;
  }
  return JSON.parse(localStorage.getItem(DATA_KEY));
}

function getData(){ return JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); }
function saveData(d){ localStorage.setItem(DATA_KEY, JSON.stringify(d)); }
function uid(prefix){ return prefix+'-'+Math.random().toString(36).slice(2,9).toUpperCase(); }
function formatNGN(n){ try{return '₦'+Number(n).toLocaleString();}catch(e){return n;} }

function statusBadge(status){
  if(!status) return '<span class="badge-status badge-pending">Unknown</span>';
  if(['Completed','Paid','Delivered','Available'].includes(status)) return `<span class="badge-status badge-completed">${status}</span>`;
  if(['Pending','Processing'].includes(status)) return `<span class="badge-status badge-pending">${status}</span>`;
  return `<span class="badge-status badge-cancelled">${status}</span>`;
}

async function renderDashboard(){
  const d = await loadInitialData();
  const orders = d.orders || [];
  const inventory = d.inventory || [];
  const customers = d.customers || [];
  const payments = d.payments || [];
  document.getElementById('k_orders').textContent = orders.length;
  document.getElementById('k_customers').textContent = customers.length;
  document.getElementById('k_inventory').textContent = inventory.length;
  const revenue = orders.reduce((s,o)=>s + (o.total_ngn||0),0);
  document.getElementById('k_revenue').textContent = formatNGN(revenue);

  const tbody = document.getElementById('recentOrdersBody');
  tbody.innerHTML = (orders.slice().reverse().slice(0,6).map(o=>{
    const cust = (customers.find(c=>c.id===o.customer_id) || {name:o.customer_id});
    return `<tr data-id="${o.id}"><td>${o.id}</td><td>${cust.name}</td><td>${new Date(o.date).toLocaleDateString()}</td><td>${statusBadge(o.status)}</td><td>${formatNGN(o.total_ngn)}</td></tr>`;
  })).join('');
  document.querySelectorAll('#recentOrdersBody tr').forEach(r=> r.addEventListener('click', ()=> openOrderModal(r.dataset.id)));

  const statusCounts = orders.reduce((acc,o)=>{ acc[o.status] = (acc[o.status]||0)+1; return acc;},{});
  const labels = Object.keys(statusCounts);
  const values = labels.map(l=>statusCounts[l]);
  const pieCtx = document.getElementById('chartPie').getContext('2d');
  window.pieChart && window.pieChart.destroy();
  window.pieChart = new Chart(pieCtx,{
    type:'pie',
    data:{ labels, datasets:[{data:values, backgroundColor: labels.map(s=> s==='Completed'?'#28a745': s==='Pending'?'#007bff':'#dc3545') }] },
    options:{ responsive:true }
  });

  const byMonth = {};
  orders.forEach(o=>{ const m = new Date(o.date).toLocaleString('default',{month:'short',year:'numeric'}); byMonth[m] = (byMonth[m]||0) + (o.total_ngn||0); });
  const months = Object.keys(byMonth).slice(-6);
  const vals = months.map(m=>byMonth[m]);
  const lineCtx = document.getElementById('chartLine').getContext('2d');
  window.lineChart && window.lineChart.destroy();
  window.lineChart = new Chart(lineCtx,{ type:'line', data:{ labels:months, datasets:[{label:'Revenue', data:vals, fill:false, borderColor:'#0ea5a3', tension:0.3}] }, options:{ responsive:true } });
}

function renderOrdersPage(){
  const d=getData();
  const orders = d.orders || [];
  const customers = d.customers || [];
  const tbody = document.getElementById('ordersTableBody');
  tbody.innerHTML = (orders.map(o=>`<tr data-id="${o.id}"><td>${o.id}</td><td>${(customers.find(c=>c.id===o.customer_id)||{name:o.customer_id}).name}</td><td>${o.date}</td><td>${statusBadge(o.status)}</td><td>${formatNGN(o.total_ngn)}</td><td class="table-actions"><button class="btn btn-sm btn-primary" onclick="openOrderForm('${o.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteOrder('${o.id}')">Delete</button></td></tr>`).join(''));
  document.querySelectorAll('#ordersTableBody tr').forEach(r=> r.addEventListener('click', (e)=>{ if(e.target.tagName==='BUTTON') return; openOrderModal(r.dataset.id); }));
}

function openOrderModal(id){
  const d=getData(); const o = d.orders.find(x=>x.id===id); if(!o) return;
  const cust = d.customers.find(c=>c.id===o.customer_id) || {name:o.customer_id};
  document.getElementById('orderViewTitle').textContent = `Order ${o.id}`;
  document.getElementById('orderViewBody').innerHTML = `<p><strong>Customer:</strong> ${cust.name}</p><p><strong>Date:</strong> ${o.date}</p><p><strong>Status:</strong> ${o.status}</p><hr><ul>${o.items.map(it=>`<li>${it.sku} x ${it.qty}</li>`).join('')}</ul><p><strong>Total:</strong> ${formatNGN(o.total_ngn)}</p>`;
  new bootstrap.Modal(document.getElementById('orderViewModal')).show();
}

function openOrderForm(id){
  const d=getData(); const o = id ? d.orders.find(x=>x.id===id): null;
  document.getElementById('orderFormId').value = o ? o.id : '';
  document.getElementById('orderFormDate').value = o ? o.date : new Date().toISOString().slice(0,10);
  document.getElementById('orderFormCustomer').innerHTML = (d.customers||[]).map(c=>`<option value="${c.id}" ${o && o.customer_id===c.id? 'selected':''}>${c.name}</option>`).join('');
  document.getElementById('orderFormItems').value = o ? o.items.map(i=>i.sku+':'+i.qty).join(',') : '';
  document.getElementById('orderFormTotal').value = o? o.total_ngn : '';
  document.getElementById('orderFormStatus').value = o? o.status : 'Pending';
  new bootstrap.Modal(document.getElementById('orderFormModal')).show();
}

function saveOrderForm(){
  const d = getData();
  const id = document.getElementById('orderFormId').value || uid('ORD');
  const date = document.getElementById('orderFormDate').value;
  const customer_id = document.getElementById('orderFormCustomer').value;
  const itemsRaw = document.getElementById('orderFormItems').value;
  const items = itemsRaw.split(',').map(s=>{const [sku,qty]=s.split(':'); return {sku:sku.trim(), qty:Number(qty||1)} }).filter(x=>x.sku);
  const inv = (d.inventory||[]).reduce((a,i)=>{a[i.sku]=i;return a;},{}) ;
  const total = items.reduce((s,it)=> s + ((inv[it.sku]?.price_ngn||0) * it.qty), 0);
  const status = document.getElementById('orderFormStatus').value || 'Pending';
  d.orders = d.orders || [];
  const ex = d.orders.find(x=>x.id===id);
  const payload = {id,date,customer_id,items,total_ngn: (document.getElementById('orderFormTotal').value || total), status};
  if(ex) Object.assign(ex,payload); else d.orders.push(payload);
  saveData(d); renderOrdersPage(); renderDashboard(); bootstrap.Modal.getInstance(document.getElementById('orderFormModal')).hide();
}

function deleteOrder(id){ if(!confirm('Delete order '+id+'?')) return; const d=getData(); d.orders=(d.orders||[]).filter(x=>x.id!==id); saveData(d); renderOrdersPage(); renderDashboard(); }

function renderInventoryPage(){
  const d=getData(); const t=document.getElementById('inventoryTableBody'); t.innerHTML = (d.inventory||[]).map(i=>`<tr data-sku="${i.sku}"><td>${i.sku}</td><td><img src="${i.thumb}" class="avatar me-2">${i.name}</td><td>${i.category}</td><td>${i.stock}</td><td>${formatNGN(i.price_ngn)}</td><td><button class="btn btn-sm btn-primary" onclick="openItemForm('${i.sku}')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteItem('${i.sku}')">Delete</button></td></tr>`).join('');
}

function openItemForm(sku){
  const d=getData(); const it = sku? d.inventory.find(x=>x.sku===sku):null;
  document.getElementById('itemFormSku').value = it?it.sku:'';
  document.getElementById('itemFormName').value = it?it.name:'';
  document.getElementById('itemFormCategory').value = it?it.category:'';
  document.getElementById('itemFormStock').value = it?it.stock:0;
  document.getElementById('itemFormPrice').value = it?it.price_ngn:0;
  document.getElementById('itemFormThumb').value = it?it.thumb:'';
  new bootstrap.Modal(document.getElementById('itemFormModal')).show();
}

function saveItemForm(){
  const d=getData(); d.inventory = d.inventory || [];
  const sku = document.getElementById('itemFormSku').value || uid('ITEM');
  const payload = { sku, name: document.getElementById('itemFormName').value, category: document.getElementById('itemFormCategory').value, stock: Number(document.getElementById('itemFormStock').value||0), price_ngn: Number(document.getElementById('itemFormPrice').value||0), thumb: document.getElementById('itemFormThumb').value||''};
  const ex = d.inventory.find(x=>x.sku===sku);
  if(ex) Object.assign(ex,payload); else d.inventory.push(payload);
  saveData(d); renderInventoryPage(); renderDashboard(); bootstrap.Modal.getInstance(document.getElementById('itemFormModal')).hide();
}

function deleteItem(sku){ if(!confirm('Delete item '+sku+'?')) return; const d=getData(); d.inventory=(d.inventory||[]).filter(x=>x.sku!==sku); saveData(d); renderInventoryPage(); renderDashboard(); }

function renderCustomersPage(){
  const d=getData(); const t=document.getElementById('customersTableBody'); t.innerHTML = (d.customers||[]).map(c=>`<tr data-id="${c.id}"><td><img src="${c.avatar||'https://i.pravatar.cc/40'}" class="avatar me-2">${c.name}</td><td>${c.email}</td><td>${c.phone}</td><td><button class="btn btn-sm btn-primary" onclick="openCustomerForm('${c.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}')">Delete</button></td></tr>`).join('');
  document.querySelectorAll('#customersTableBody tr').forEach(r=> r.addEventListener('click', (e)=>{ if(e.target.tagName==='BUTTON') return; openCustomerModal(r.dataset.id); }));
}

function openCustomerModal(id){
  const d=getData(); const c = d.customers.find(x=>x.id===id); if(!c) return;
  document.getElementById('custViewTitle').textContent = c.name;
  document.getElementById('custViewBody').innerHTML = `<p><strong>Email:</strong> ${c.email}</p><p><strong>Phone:</strong> ${c.phone}</p><p><strong>Joined:</strong> ${c.joined}</p>`;
  document.getElementById('custViewEdit').onclick = ()=> { bootstrap.Modal.getInstance(document.getElementById('custViewModal')).hide(); openCustomerForm(id); };
  document.getElementById('custViewDelete').onclick = ()=> { if(confirm('Delete customer '+c.name+'?')){ deleteCustomer(id); bootstrap.Modal.getInstance(document.getElementById('custViewModal')).hide(); } };
  new bootstrap.Modal(document.getElementById('custViewModal')).show();
}

function openCustomerForm(id){
  const d=getData(); const c = id ? d.customers.find(x=>x.id===id) : null;
  document.getElementById('custFormId').value = c? c.id : '';
  document.getElementById('custFormName').value = c? c.name : '';
  document.getElementById('custFormEmail').value = c? c.email : '';
  document.getElementById('custFormPhone').value = c? c.phone : '';
  document.getElementById('custFormAvatar').value = c? c.avatar : '';
  new bootstrap.Modal(document.getElementById('custFormModal')).show();
}

function saveCustomerForm(){
  const d=getData(); d.customers = d.customers || [];
  const id = document.getElementById('custFormId').value || uid('CUST');
  const payload = { id, name: document.getElementById('custFormName').value, email: document.getElementById('custFormEmail').value, phone: document.getElementById('custFormPhone').value, joined: new Date().toISOString().slice(0,10), avatar: document.getElementById('custFormAvatar').value || ('https://i.pravatar.cc/150?u='+id) };
  const ex = d.customers.find(x=>x.id===id);
  if(ex) Object.assign(ex,payload); else d.customers.push(payload);
  saveData(d); renderCustomersPage(); renderDashboard(); bootstrap.Modal.getInstance(document.getElementById('custFormModal')).hide();
}

function deleteCustomer(id){ if(!confirm('Delete customer '+id+'?')) return; const d=getData(); d.customers=(d.customers||[]).filter(x=>x.id!==id); saveData(d); renderCustomersPage(); renderDashboard(); }

function renderPaymentsPage(){
  const d=getData(); const t=document.getElementById('paymentsTableBody'); const cust = (d.customers||[]).reduce((a,c)=>{a[c.id]=c;return a;},{}) ;
  t.innerHTML = (d.payments||[]).map(p=>`<tr data-id="${p.id}"><td>${p.id}</td><td>${cust[p.customer_id]?.name||p.customer_id}</td><td>${formatNGN(p.amount_ngn)}</td><td>${p.method}</td><td>${p.date}</td><td><button class="btn btn-sm btn-primary" onclick="openPaymentForm('${p.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">Delete</button></td></tr>`).join('');
}

function openPaymentForm(id){
  const d=getData(); const p = id? d.payments.find(x=>x.id===id):null;
  document.getElementById('payFormId').value = p? p.id : '';
  document.getElementById('payFormOrder').value = p? p.order_id : '';
  document.getElementById('payFormAmount').value = p? p.amount_ngn : 0;
  document.getElementById('payFormMethod').value = p? p.method : '';
  document.getElementById('payFormDate').value = p? p.date : new Date().toISOString().slice(0,10);
  document.getElementById('payFormStatus').value = p? p.status : 'Completed';
  document.getElementById('payFormCustomer').innerHTML = (d.customers||[]).map(c=>`<option value="${c.id}" ${p && p.customer_id===c.id? 'selected':''}>${c.name}</option>`).join('');
  new bootstrap.Modal(document.getElementById('payFormModal')).show();
}

function savePaymentForm(){
  const d=getData(); d.payments = d.payments || [];
  const id = document.getElementById('payFormId').value || uid('PAY');
  const payload = { id, order_id: document.getElementById('payFormOrder').value, customer_id: document.getElementById('payFormCustomer').value, amount_ngn: Number(document.getElementById('payFormAmount').value||0), method: document.getElementById('payFormMethod').value, date: document.getElementById('payFormDate').value, status: document.getElementById('payFormStatus').value || 'Completed' };
  const ex = d.payments.find(x=>x.id===id);
  if(ex) Object.assign(ex,payload); else d.payments.push(payload);
  saveData(d); renderPaymentsPage(); renderDashboard(); bootstrap.Modal.getInstance(document.getElementById('payFormModal')).hide();
}

function deletePayment(id){ if(!confirm('Delete payment '+id+'?')) return; const d=getData(); d.payments=(d.payments||[]).filter(x=>x.id!==id); saveData(d); renderPaymentsPage(); renderDashboard(); }

document.addEventListener('DOMContentLoaded', async ()=>{
  await loadInitialData();
  if(document.getElementById('k_orders')) renderDashboard();
  if(document.getElementById('ordersTableBody')) renderOrdersPage();
  if(document.getElementById('inventoryTableBody')) renderInventoryPage();
  if(document.getElementById('customersTableBody')) renderCustomersPage();
  if(document.getElementById('paymentsTableBody')) renderPaymentsPage();

  document.querySelectorAll('[data-action="saveOrder"]').forEach(b=>b.addEventListener('click', saveOrderForm));
  document.querySelectorAll('[data-action="saveItem"]').forEach(b=>b.addEventListener('click', saveItemForm));
  document.querySelectorAll('[data-action="saveCust"]').forEach(b=>b.addEventListener('click', saveCustomerForm));
  document.querySelectorAll('[data-action="savePay"]').forEach(b=>b.addEventListener('click', savePaymentForm));

  const searchOrders = document.getElementById('searchOrders'); if(searchOrders){ searchOrders.addEventListener('input', ()=>{ const q=searchOrders.value.toLowerCase(); document.querySelectorAll('#ordersTableBody tr').forEach(r=> r.style.display = (r.innerText.toLowerCase().includes(q)?'':'none')); }); }
  const searchInventory = document.getElementById('searchInventory'); if(searchInventory){ searchInventory.addEventListener('input', ()=>{ const q=searchInventory.value.toLowerCase(); document.querySelectorAll('#inventoryTableBody tr').forEach(r=> r.style.display = (r.innerText.toLowerCase().includes(q)?'':'none')); }); }
  const searchCustomers = document.getElementById('searchCustomers'); if(searchCustomers){ searchCustomers.addEventListener('input', ()=>{ const q=searchCustomers.value.toLowerCase(); document.querySelectorAll('#customersTableBody tr').forEach(r=> r.style.display = (r.innerText.toLowerCase().includes(q)?'':'none')); }); }
  const searchPayments = document.getElementById('searchPayments'); if(searchPayments){ searchPayments.addEventListener('input', ()=>{ const q=searchPayments.value.toLowerCase(); document.querySelectorAll('#paymentsTableBody tr').forEach(r=> r.style.display = (r.innerText.toLowerCase().includes(q)?'':'none')); }); }
});
