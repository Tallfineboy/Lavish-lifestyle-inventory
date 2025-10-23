
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


/* --- Dashboard enhancements: theme toggle, donut chart, icons, sorting, pagination --- */
(function(){
  // Only run on dashboard page (presence of chartPie element)
  function isDashboard(){ return document.getElementById('chartPie') || document.querySelector('.kpi-grid'); }

  function createThemeToggle(){
    if(!isDashboard()) return;
    if(document.getElementById('themeToggle')) return;
    var btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.title = 'Switch to Dark Mode';
    btn.innerText = '🌙';
    // style: fixed top-right but inside container for dashboard only
    btn.style.position = 'fixed';
    btn.style.top = '12px';
    btn.style.right = '12px';
    btn.style.zIndex = 9999;
    btn.style.border = '0';
    btn.style.background = 'transparent';
    btn.style.fontSize = '20px';
    btn.style.cursor = 'pointer';
    btn.style.padding = '6px';
    btn.style.borderRadius = '6px';
    document.body.appendChild(btn);

    // apply saved theme
    if(localStorage.getItem('siteTheme')==='dark'){
      document.body.classList.add('dark-mode');
      btn.innerText = '☀️';
      btn.title = 'Switch to Light Mode';
    } else {
      document.body.classList.remove('dark-mode');
      btn.innerText = '🌙';
      btn.title = 'Switch to Dark Mode';
    }

    btn.addEventListener('click', function(){
      document.body.classList.toggle('dark-mode');
      var isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('siteTheme', isDark ? 'dark' : 'light');
      btn.innerText = isDark ? '☀️' : '🌙';
      btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      // re-render dashboard charts to pick up theme changes
      if(window.renderDashboard) window.renderDashboard();
    });

    // tooltip via title is enough; also show small fade effect via CSS (style.css will include transitions)
  }

  function addKpiIcons(){
    if(!isDashboard()) return;
    var kpis = document.querySelectorAll('.kpi-grid .kpi');
    var icons = ['fa-shopping-cart','fa-coins','fa-users','fa-box-open'];
    kpis.forEach((k,i)=>{
      if(k.querySelector('.kpi-icon')) return;
      var ic = document.createElement('i');
      ic.className = 'fa ' + (icons[i] || 'fa-star') + ' kpi-icon';
      ic.style.marginRight = '8px';
      ic.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#0ea5a3';
      var h6 = k.querySelector('h6');
      if(h6) h6.prepend(ic);
    });
  }

  // Pagination & sorting for recent orders
  var ORDERS_PAGE_SIZE = 10;
  var currentOrders = [];
  var currentFilter = 'All';
  var currentPage = 1;

  function renderOrdersPage(page){
    page = page || 1;
    currentPage = page;
    var tbody = document.getElementById('recentOrdersBody');
    if(!tbody) return;
    var filtered = currentOrders.slice();
    if(currentFilter !== 'All') filtered = filtered.filter(o=> o.status === currentFilter);
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
    if(page > totalPages) page = totalPages;
    var start = (page-1)*ORDERS_PAGE_SIZE;
    var pageItems = filtered.slice(start, start + ORDERS_PAGE_SIZE);

    tbody.innerHTML = pageItems.map(o=>{
      return `<tr data-id="${o.id}"><td>${o.id}</td><td>${(o.customer_name||o.customer_id)}</td><td>${o.status}</td><td>${formatNGN(o.total_ngn || o.total || 0)}</td><td>${o.date}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="text-center">No records found</td></tr>';

    buildPaginationControls(totalPages, page);
  }

  function buildPaginationControls(totalPages, page){
    var containerId = 'ordersPagination';
    var existing = document.getElementById(containerId);
    if(!existing){
      var tableCard = document.querySelector('#recentOrdersBody')?.closest('.card');
      if(!tableCard) return;
      existing = document.createElement('div');
      existing.id = containerId;
      existing.style.textAlign = 'center';
      existing.style.padding = '10px 0 18px';
      tableCard.appendChild(existing);
    }
    existing.innerHTML = '';
    var prev = document.createElement('button');
    prev.className = 'btn btn-sm btn-outline-secondary me-2';
    prev.textContent = 'Previous';
    prev.disabled = (page <= 1);
    prev.addEventListener('click', ()=>{ if(page>1) renderOrdersPage(page-1); });

    var next = document.createElement('button');
    next.className = 'btn btn-sm btn-outline-secondary ms-2';
    next.textContent = 'Next';
    next.disabled = (page >= totalPages);
    next.addEventListener('click', ()=>{ if(page<totalPages) renderOrdersPage(page+1); });

    var label = document.createElement('span');
    label.textContent = `Page ${page} of ${totalPages}`;
    label.style.margin = '0 8px';

    existing.appendChild(prev);
    existing.appendChild(label);
    existing.appendChild(next);
  }

  // Insert Sort By dropdown into Recent Orders card
  function insertSortDropdown(){
    if(!isDashboard()) return;
    var card = document.querySelector('#recentOrdersBody')?.closest('.card');
    if(!card) return;
    if(card.querySelector('#sortByOrders')) return;
    var header = card.querySelector('h6');
    var wrapper = document.createElement('div');
    wrapper.style.float = 'right';
    wrapper.innerHTML = `<label style="margin-right:6px;font-weight:600">Sort by</label>
      <select id="sortByOrders" class="form-select form-select-sm" style="display:inline-block;width:auto;">
        <option value="All">All</option>
        <option value="Completed">Completed</option>
        <option value="Pending">Pending</option>
        <option value="Failed">Failed</option>
      </select>`;
    header.appendChild(wrapper);
    document.getElementById('sortByOrders').addEventListener('change', function(e){
      currentFilter = this.value;
      renderOrdersPage(1);
    });
  }

  // Hook into dashboard render to populate currentOrders then call renderOrdersPage
  var originalRenderDashboard = window.renderDashboard;
  window.renderDashboard = async function(){
    if(typeof originalRenderDashboard === 'function'){
      await originalRenderDashboard();
    }
    // after original render populates DOM, collect orders from localStorage data
    var d = getData();
    currentOrders = (d.orders || []).slice().reverse();
    // enrich with customer name
    var custMap = {};
    (d.customers || []).forEach(c=>custMap[c.id]=c.name);
    currentOrders = currentOrders.map(o=> Object.assign({}, o, { customer_name: custMap[o.customer_id] || o.customer_id }));
    // render first page
    renderOrdersPage(1);
    // create sort dropdown and pagination controls
    insertSortDropdown();
    createThemeToggle();
    addKpiIcons();

    // transform pie to donut by re-creating chart if exists
    if(window.pieChart){
      try{ window.pieChart.config.type = 'doughnut'; window.pieChart.update(); }catch(e){
        // recreate pie chart by calling original code section: call renderDashboard again after a tiny delay
        setTimeout(()=>{ if(window.renderDashboard) window.renderDashboard(); }, 200);
      }
    }
  };

  // On load, if theme was set earlier, apply it
  document.addEventListener('DOMContentLoaded', function(){
    if(localStorage.getItem('siteTheme')==='dark') document.body.classList.add('dark-mode');
    // ensure enhancements run if dashboard already initialized
    if(window.renderDashboard) window.renderDashboard();
  });

})();


// Login handling logic
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      try {
        const response = await fetch("assets/data/data.json");
        const data = await response.json();
        const user = data.customers.find(
          (cust) => cust.email === email && cust.password === password
        );
        if (user) {
          loginMessage.textContent = "✅ Login successful!";
          loginMessage.style.color = "green";
          window.location.href = "dashboard.html";
        } else {
          loginMessage.textContent = "❌ Invalid email or password.";
          loginMessage.style.color = "red";
        }
      } catch (err) {
        loginMessage.textContent = "⚠️ Error loading data.";
        loginMessage.style.color = "red";
      }
    });
  }
});
