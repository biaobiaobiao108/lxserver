var v=window.sessionStorage,m=null,b=null,S="";function f(t,e,s){if(t.getAttribute(e)!==s)t.setAttribute(e,s)}function B(t){return!t.classList.contains("hidden")&&getComputedStyle(t).display!=="none"}function C(t){return Array.from(t.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((e)=>getComputedStyle(e).display!=="none"&&getComputedStyle(e).visibility!=="hidden")}function I(){let t=Array.from(document.querySelectorAll("#login-overlay, .modal")),e=t.filter(B).at(-1)||null,s=document.getElementById("app");if(t.forEach((n)=>{if(f(n,"role","dialog"),f(n,"aria-modal","true"),f(n,"aria-hidden",String(!B(n))),!n.hasAttribute("tabindex"))n.setAttribute("tabindex","-1");let a=n.querySelector("h1, h2, h3");if(a){if(!a.id)a.id=`${n.id||"admin-overlay"}-title`;f(n,"aria-labelledby",a.id)}}),e&&e!==m){if(document.activeElement instanceof HTMLElement&&!e.contains(document.activeElement))b=document.activeElement;if(m=e,S=document.body.style.overflow,document.body.style.overflow="hidden",s){if(!s.inert)s.inert=!0;if(!s.hasAttribute("inert"))s.setAttribute("inert","")}requestAnimationFrame(()=>{(C(e)[0]||e).focus({preventScroll:!0})})}else if(!e&&m){if(m=null,document.body.style.overflow=S,s){if(s.inert)s.inert=!1;s.removeAttribute("inert")}if(b?.isConnected)b.focus({preventScroll:!0});b=null}}function P(){document.querySelectorAll("input, select, textarea").forEach((e)=>{let s=e;if(s.type==="hidden")return;if(s.getAttribute("aria-label")||s.getAttribute("aria-labelledby")||s.labels?.length)return;let a=e.parentElement?.querySelector("label")?.textContent?.trim()||s.placeholder||s.name||s.id||s.type;if(a)s.setAttribute("aria-label",a.replace(/\s+/g," "))}),document.querySelectorAll("button").forEach((e)=>{if(e.getAttribute("aria-label")||e.textContent?.trim())return;let s=e.title||e.id.replace(/[-_]+/g," ").trim()||"操作按钮";e.setAttribute("aria-label",s)}),document.addEventListener("keydown",(e)=>{if(!m)return;if(e.key==="Escape"){if(m.id==="login-overlay")return;e.preventDefault();let o=m.querySelector(".modal-close");if(o)o.click();else m.classList.add("hidden");return}if(e.key!=="Tab")return;let s=C(m);if(!s.length){e.preventDefault(),m.focus();return}let n=s[0],a=s[s.length-1];if(e.shiftKey&&document.activeElement===n)e.preventDefault(),a.focus();else if(!e.shiftKey&&document.activeElement===a)e.preventDefault(),n.focus()},!0),new MutationObserver(I).observe(document.body,{attributes:!0,attributeFilter:["class","hidden","style","inert"],childList:!0,subtree:!0}),I()}function U(t){if(!t)return"var(--accent-primary)";let e=0;for(let n=0;n<t.length;n++)e=t.charCodeAt(n)+((e<<5)-e);return`hsl(${Math.abs(e)%360}, 70%, 45%)`}function D(t,e=""){if(!t)return e;try{let s=new URL(String(t),window.location.origin);return s.protocol==="http:"||s.protocol==="https:"?s.href:e}catch{return e}}function h(t){return JSON.stringify(String(t??"")).replace(/&/g,"&amp;").replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function T(t,e){if(!window.marked){t.textContent=e;return}let s=document.createElement("template");s.innerHTML=window.marked.parse(String(e??"")),s.content.querySelectorAll("script, iframe, object, embed, frame, frameset, form, link, meta, base, style").forEach((n)=>n.remove()),s.content.querySelectorAll("*").forEach((n)=>{Array.from(n.attributes).forEach((a)=>{let o=a.name.toLowerCase();if(o.startsWith("on")||o==="style"){n.removeAttribute(a.name);return}if(o!=="href"&&o!=="src"&&o!=="xlink:href"&&o!=="action"&&o!=="formaction")return;try{let i=new URL(a.value,window.location.origin);if(i.protocol!=="http:"&&i.protocol!=="https:")n.removeAttribute(a.name)}catch{n.removeAttribute(a.name)}})}),t.replaceChildren(s.content)}class A{constructor(){this.password=null,this.currentView="dashboard",this.users=[],this.configLoaded=!1,this.systemCpuHistory=[],this.processCpuHistory=[],this.systemMemHistory=[],this.processMemHistory=[],this.monitorTimer=null,this.init(),this.initPlayerLink()}init(){P();let t=v.getItem("lx_auth");if(t)this.password=t,this.showApp(),this.loadConfig(),this.loadDashboard();document.getElementById("login-btn")?.addEventListener("click",()=>this.login()),document.getElementById("access-password")?.addEventListener("keypress",(e)=>{if(e.key==="Enter")this.login()}),document.getElementById("logout-btn")?.addEventListener("click",()=>this.logout()),document.querySelectorAll(".nav-item").forEach((e)=>{e.addEventListener("click",(s)=>{let n=e.dataset.view;if(n==="music")return;s.preventDefault(),this.switchView(n)})}),document.querySelectorAll(".action-btn").forEach((e)=>{e.addEventListener("click",()=>{let s=e.dataset.action;this.handleQuickAction(s)})}),document.getElementById("add-user-btn")?.addEventListener("click",()=>this.showAddUserModal()),document.getElementById("refresh-users-btn")?.addEventListener("click",async()=>{try{await this.saveConfig(!0),await this.request("/api/admin/reload",{method:"POST"}),this.loadUsers(),this.loadDashboard(),showSuccess("重载数据成功")}catch(e){showError("重载数据失败: "+e.message)}}),document.getElementById("batch-delete-users-btn")?.addEventListener("click",()=>this.batchDeleteUsers()),document.getElementById("select-all-users")?.addEventListener("change",(e)=>this.toggleAllUsers(e.target.checked)),document.getElementById("save-password-btn")?.addEventListener("click",()=>this.saveNewPassword()),document.getElementById("save-rename-user-btn")?.addEventListener("click",()=>this.saveRenameUser()),document.querySelectorAll(".modal-close").forEach((e)=>{e.addEventListener("click",()=>{document.getElementById("edit-password-modal")?.classList.add("hidden"),document.getElementById("rename-user-modal")?.classList.add("hidden"),document.getElementById("modal")?.classList.add("hidden")})}),document.getElementById("restart-server-btn")?.addEventListener("click",()=>{this.restartServer()}),document.getElementById("refresh-data-btn")?.addEventListener("click",()=>this.loadUserData()),document.getElementById("data-user-select")?.addEventListener("change",()=>this.loadUserData()),document.getElementById("config-form")?.addEventListener("submit",(e)=>{e.preventDefault(),this.saveConfig()}),document.getElementById("reload-config-btn")?.addEventListener("click",async()=>{await this.saveConfig(!0),this.loadConfig()}),document.querySelector('input[name="user.enablePublicFavorites"]')?.addEventListener("change",()=>{this.togglePublicNonAdminAccessVisibility()}),document.querySelector('input[name="user.enablePublicRestriction"]')?.addEventListener("change",()=>{this.togglePublicNonAdminLocalMusicVisibility()}),document.getElementById("refresh-logs-btn")?.addEventListener("click",()=>this.loadLogs()),document.getElementById("log-type-select")?.addEventListener("change",()=>this.loadLogs()),document.querySelector(".modal-close")?.addEventListener("click",()=>this.closeModal()),document.getElementById("modal")?.addEventListener("click",(e)=>{if(e.target.id==="modal")this.closeModal()}),document.getElementById("data-user-select")?.addEventListener("change",()=>this.loadUserData()),this.bindWebDAVEvents(),this.deferredPrompt=null,window.addEventListener("beforeinstallprompt",(e)=>{e.preventDefault(),this.deferredPrompt=e;let s=document.getElementById("install-pwa-btn");if(s)s.style.display="inline-flex",s.addEventListener("click",()=>this.installPWA())}),document.getElementById("snapshot-upload-input")?.addEventListener("change",(e)=>this.handleSnapshotUpload(e)),this.initMobileEvents()}initMobileEvents(){let t=document.getElementById("mobile-menu-btn"),e=document.getElementById("mobile-sidebar-overlay"),s=document.querySelector(".sidebar"),n=()=>{if(s.classList.toggle("active"),e.classList.toggle("active"),e.classList.contains("active"))e.classList.remove("hidden");else setTimeout(()=>{if(!e.classList.contains("active"))e.classList.add("hidden")},300)};if(t)t.addEventListener("click",n);if(e)e.addEventListener("click",n);document.querySelectorAll(".nav-item").forEach((a)=>{a.addEventListener("click",()=>{if(window.innerWidth<=768&&s&&s.classList.contains("active"))n()})})}async installPWA(){if(!this.deferredPrompt)return;this.deferredPrompt.prompt();let{outcome:t}=await this.deferredPrompt.userChoice;console.log(`User response to the install prompt: ${t}`),this.deferredPrompt=null,document.getElementById("install-pwa-btn").style.display="none"}async login(){let t=document.getElementById("access-password").value,e=document.getElementById("login-error");if(!t){e.textContent="请输入密码";return}try{if((await this.request("/api/login",{method:"POST",body:JSON.stringify({password:t})})).success)this.password=t,v.setItem("lx_auth",t),this.showApp(),this.loadDashboard();else e.textContent="密码错误"}catch(s){e.textContent="登录失败，请重试"}}logout(){fetch("/api/logout",{method:"POST"}).catch(()=>{return}),v.removeItem("lx_auth"),location.reload()}showApp(){document.getElementById("login-overlay").classList.add("hidden"),document.getElementById("app").classList.remove("hidden")}async switchView(t){document.querySelectorAll(".nav-item").forEach((s)=>{s.classList.toggle("active",s.dataset.view===t)}),document.querySelectorAll(".view").forEach((s)=>{s.classList.toggle("active",s.id===`view-${t}`)});let e={dashboard:"仪表盘",users:"用户管理",data:"数据查看",config:"系统配置",logs:"系统日志",webdav:"WebDAV同步",snapshots:"快照管理",about:"关于"};switch(document.getElementById("page-title").textContent=e[t]||t,this.currentView=t,t){case"dashboard":this.loadDashboard();break;case"users":this.loadUsers();break;case"data":this.loadUserData();break;case"config":this.loadConfig();break;case"logs":this.loadLogs();break;case"webdav":try{let s=await this.request("/api/status");this.checkWebDAVConfig(s.isWebDAVConfigured),this.loadSyncLogs()}catch(s){console.error("Failed to check webdav status:",s)}break;case"snapshots":this.loadSnapshots();break;case"about":this.loadAbout();break;case"music":window.location.href=window.CONFIG&&window.CONFIG["player.path"]||"/music";return}}handleQuickAction(t){switch(t){case"add-user":this.switchView("users"),setTimeout(()=>this.showAddUserModal(),100);break;case"view-logs":this.switchView("logs");break;case"edit-config":this.switchView("config");break}}async loadAbout(){let t=document.getElementById("about-content");if(!t)return;try{let e=await fetch("/about.md");if(!e.ok)throw Error("Failed to load about.md");let s=await e.text();if(window.marked){let n=window.CONFIG&&window.CONFIG.buildHash||"unknown",a=s.replace(/{{buildHash}}/g,n);T(t,a)}else t.innerText=s}catch(e){console.error("Failed to load about content:",e),t.innerHTML='<p style="color: var(--accent-error); text-align: center;">加载关于页面失败</p>'}}checkForUpdates(){if(window.LxNotification&&window.LxNotification.checkUpdates)window.LxNotification.checkUpdates(!0);else showInfo("通知服务未就绪，请稍后重试")}initPlayerLink(){let t=document.getElementById("nav-player-link");if(t&&window.CONFIG&&window.CONFIG["player.path"])t.href=window.CONFIG["player.path"]}async loadDashboard(){this.updateGreeting();try{let t=await this.request("/api/status");document.getElementById("stat-users").textContent=t.users,document.getElementById("stat-devices").textContent=t.devices,document.getElementById("stat-cpu").textContent=t.cpuUsage+"%",document.getElementById("stat-memory").textContent=this.formatFileSize(t.memory),this.updateMonitorUI(t);let e=await this.request("/api/users");this.allUsers=e,this.renderAllUserSelectors(),this.startMonitor()}catch(t){console.error("Failed to load dashboard:",t)}}updateGreeting(){let t=new Date().getHours(),e="你好";if(t<6)e="深夜好";else if(t<9)e="早安";else if(t<12)e="上午好";else if(t<14)e="中午好";else if(t<18)e="下午好";else if(t<22)e="晚上好";else e="深夜好";let s=document.getElementById("greeting-text");if(s)s.textContent=e;let n=document.getElementById("dashboard-date");if(n){let a={weekday:"long",year:"numeric",month:"long",day:"numeric"};n.textContent="今天是 "+new Date().toLocaleDateString("zh-CN",a)}}startMonitor(){if(this.monitorTimer)return;this.monitorTimer=setInterval(async()=>{if(this.currentView!=="dashboard"||!this.password){clearInterval(this.monitorTimer),this.monitorTimer=null;return}try{let t=await this.request("/api/status");this.updateMonitorUI(t)}catch(t){console.error("Monitor refresh failed:",t)}},3000)}updateMonitorUI(t){let e=parseFloat(t.cpuUsage)||0,s=parseFloat(t.processCpuUsage)||0,n=document.getElementById("stat-cpu"),a=document.getElementById("stat-process-cpu");if(n)n.textContent=e.toFixed(2)+"%";if(a)a.textContent=s.toFixed(2)+"%";let o=document.getElementById("monitor-cpu-progress"),i=document.getElementById("monitor-cpu-val"),r=document.getElementById("monitor-process-cpu-val");if(o)o.style.width=Math.max(e,s)+"%";if(i)i.textContent=e.toFixed(2)+"%";if(r)r.textContent=s.toFixed(2)+"%";if(this.systemCpuHistory.push(e),this.processCpuHistory.push(s),this.systemCpuHistory.length>20)this.systemCpuHistory.shift(),this.processCpuHistory.shift();this.renderMultiLineChart("cpu-chart",[{data:this.systemCpuHistory,color:"rgba(59, 130, 246, 0.4)",fill:!0,label:"System"},{data:this.processCpuHistory,color:"#a855f7",fill:!1,label:"Process",strokeWidth:3}]);let c=parseFloat(t.systemMemoryUsage)||0,l=parseFloat(t.processMemoryUsage)||0,u=document.getElementById("stat-memory-percent"),d=document.getElementById("stat-process-memory-percent"),p=document.getElementById("stat-memory");if(u)u.textContent=c.toFixed(2)+"%";if(d)d.textContent=l.toFixed(2)+"%";if(p)p.textContent=this.formatFileSize(t.memory);let y=document.getElementById("monitor-mem-progress"),g=document.getElementById("monitor-mem-val"),w=document.getElementById("monitor-process-mem-val");if(y)y.style.width=c+"%";if(g)g.textContent=c.toFixed(2)+"%";if(w)w.textContent=l.toFixed(2)+"%";if(this.systemMemHistory.push(c),this.processMemHistory.push(l),this.systemMemHistory.length>20)this.systemMemHistory.shift(),this.processMemHistory.shift();this.renderMultiLineChart("mem-chart",[{data:this.systemMemHistory,color:"rgba(16, 185, 129, 0.4)",fill:!0,label:"System"},{data:this.processMemHistory,color:"#3b82f6",fill:!1,label:"Process",strokeWidth:3}]);let E=document.getElementById("stat-users"),k=document.getElementById("stat-devices"),L=document.getElementById("stat-uptime");if(E)E.textContent=t.users;if(k)k.textContent=t.devices;if(L)L.textContent=this.formatUptime(t.uptime);let x=document.getElementById("stat-cpu-info");if(x){let M=(t.cpuSpeed/1000).toFixed(1);x.textContent=`${t.cpus} Cores @ ${M}GHz`}}renderMultiLineChart(t,e){let s=document.getElementById(t);if(!s)return;let n=200,a=60,o=5,i="";e.forEach((r,c)=>{if(r.data.length<2)return;let l=r.data.map((d,p)=>{let y=p/(r.data.length-1)*n,g=a-Math.max(d,2)/100*(a-o*2)-o;return{x:y,y:g}}),u=`M ${l[0].x} ${l[0].y}`;for(let d=0;d<l.length-1;d++){let p=(l[d].x+l[d+1].x)/2,y=(l[d].y+l[d+1].y)/2;u+=` Q ${l[d].x} ${l[d].y} ${p} ${y}`}if(u+=` L ${l[l.length-1].x} ${l[l.length-1].y}`,r.fill){let d=u+` L ${n} ${a} L 0 ${a} Z`;i+=`
                    <defs>
                        <linearGradient id="grad-${t}-${c}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:${r.color};stop-opacity:0.3" />
                            <stop offset="100%" style="stop-color:${r.color};stop-opacity:0" />
                        </linearGradient>
                    </defs>
                    <path d="${d}" fill="url(#grad-${t}-${c})" />
                `}i+=`<path d="${u}" fill="none" stroke="${r.color}" stroke-width="${r.strokeWidth||2}" stroke-linecap="round" />`}),s.innerHTML=i}renderAllUserSelectors(){if(this.renderUserDropdown("data"),this.renderUserDropdown("snapshot"),!document.getElementById("data-user-select").value)this.renderUserSelectionGrid("data");if(!document.getElementById("snapshot-user-select").value)this.renderUserSelectionGrid("snapshot")}toggleUserDropdown(t){let e=document.getElementById(`${t}-user-selector`),s=document.getElementById(`${t}-user-dropdown`),n=e?.querySelector(".selector-trigger"),a=!s.classList.contains("hidden");if(document.querySelectorAll(".selector-dropdown").forEach((o)=>o.classList.add("hidden")),document.querySelectorAll(".custom-user-selector").forEach((o)=>{o.classList.remove("open"),o.querySelector(".selector-trigger")?.setAttribute("aria-expanded","false")}),!a)s.classList.remove("hidden"),e.classList.add("open"),n?.setAttribute("aria-expanded","true")}renderUserDropdown(t){let e=document.getElementById(`${t}-user-dropdown`);if(!e||!this.allUsers)return;let s=document.getElementById(`${t}-user-select`).value;e.innerHTML=this.allUsers.map((n)=>{let a=n.name==="_open",o=a?"公开用户 (_open)":this.escapeHtml(n.name),i=a?"\uD83C\uDF10":this.escapeHtml(n.name.charAt(0).toUpperCase()),r=a?"background: linear-gradient(135deg, #10b981, #059669); font-size:12px;":"";return`
            <div class="dropdown-item ${n.name===s?"active":""}" 
                 onclick="app.selectUser(${h(t)}, ${h(n.name)})">
                <div class="dropdown-avatar" style="${r}">${i}</div>
                <span>${o}</span>
                ${n.name===s?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;margin-left:auto;"><polyline points="20 6 9 17 4 12"></polyline></svg>':""}
            </div>
        `}).join("")}renderUserSelectionGrid(t){let e=t==="data"?document.getElementById("data-content"):document.getElementById("snapshots-list");if(!e||!this.allUsers)return;if(t==="data")document.getElementById("data-stats").innerHTML="";e.innerHTML=`
            <div class="user-selection-grid fade-in">
                ${this.allUsers.map((s)=>{let n=s.name==="_open",a=n?"公开用户 (_open)":this.escapeHtml(s.name),o=n?"公共数据与歌单":"用户数据",i=n?"background: linear-gradient(135deg, #10b981, #059669); font-size: 1.5rem;":"",r=n?"\uD83C\uDF10":this.escapeHtml(s.name.charAt(0).toUpperCase());return`
                    <div class="user-select-card" role="button" tabindex="0" aria-label="选择用户 ${a}" onclick="app.selectUser(${h(t)}, ${h(s.name)})" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); app.selectUser(${h(t)}, ${h(s.name)}); }">
                        <div class="avatar" style="${i}">${r}</div>
                        <div class="name">${a}</div>
                        <div class="role">${o}</div>
                    </div>
                `}).join("")}
            </div>
        `}selectUser(t,e){let s=document.getElementById(`${t}-user-select`),n=document.querySelector(`#${t}-user-selector .selected-username`);if(s.value=e,n.textContent=e==="_open"?"公开用户 (_open)":e,document.getElementById(`${t}-user-dropdown`).classList.add("hidden"),document.getElementById(`${t}-user-selector`).classList.remove("open"),this.renderUserDropdown(t),t==="data")this.loadUserData();else this.loadSnapshots()}async loadUsers(){try{let t=await this.request("/api/users");this.users=t.filter((e)=>e.name!=="_open"),this.renderUsers()}catch(t){console.error("Failed to load users:",t)}}async batchDeleteUsers(){let t=document.querySelectorAll(".user-checkbox:checked"),e=Array.from(t).map((n)=>{let a=parseInt(n.dataset.index);return this.users[a]?.name}).filter((n)=>n);if(!e.length)return;let s=await this.showBatchDeleteUserDialog(e.length);if(s===null)return;try{await this.request("/api/users",{method:"DELETE",body:JSON.stringify({names:e,deleteData:s})}),this.loadUsers(),showSuccess("批量删除成功")}catch(n){showError("删除失败: "+n.message)}}async showBatchDeleteUserDialog(t){return new Promise((e)=>{let s=document.getElementById("modal"),n=document.getElementById("modal-title"),a=document.getElementById("modal-body");n.textContent="批量删除用户确认",a.innerHTML=`
                <div style="padding: 1rem 0;">
                    <p style="margin-bottom: 1rem; font-size: 1rem;">确定要删除选中的 <strong>${t}</strong> 个用户吗？</p>
                    <div class="form-group" style="margin-top: 1.5rem;">
                        <label class="checkbox-label" style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="batch-delete-user-data-checkbox" style="margin-right: 0.5rem;">
                            <span>同时删除用户数据文件夹</span>
                        </label>
                        <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem; margin-left: 1.5rem;">
                            ⚠️ 勾选后将永久删除所有选中用户的数据（歌单、收藏等），不可恢复！
                        </small>
                    </div>
                </div>
                <div class="form-actions" style="margin-top: 1.5rem;">
                    <button type="button" class="btn-primary" id="confirm-batch-delete-users">确认删除</button>
                    <button type="button" class="btn-secondary" id="cancel-batch-delete-users">取消</button>
                </div>
            `,s.classList.remove("hidden"),document.getElementById("confirm-batch-delete-users").addEventListener("click",()=>{let o=document.getElementById("batch-delete-user-data-checkbox").checked;s.classList.add("hidden"),e(o)}),document.getElementById("cancel-batch-delete-users").addEventListener("click",()=>{s.classList.add("hidden"),e(null)})})}toggleAllUsers(t){document.querySelectorAll(".user-checkbox").forEach((s)=>{s.checked=t}),this.updateUserBatchBtn()}updateUserBatchBtn(){let t=document.querySelectorAll(".user-checkbox:checked"),e=document.getElementById("batch-delete-users-btn"),s=document.getElementById("user-selected-count");if(e&&s)if(t.length>0)e.style.display="inline-flex",s.textContent=t.length;else e.style.display="none";let n=document.getElementById("select-all-users");if(n){let a=document.querySelectorAll(".user-checkbox");if(a.length>0)n.checked=t.length===a.length;else n.checked=!1}}renderUsers(){let t=document.getElementById("users-list");if(!this.users.length){t.innerHTML=`
                <div class="glass" style="padding: 3rem; text-align: center; width: 100%;">
                    <p style="color: var(--text-secondary);">暂无用户，点击上方按钮添加用户</p>
                </div>
            `;return}t.innerHTML=this.users.map((s,n)=>`
            <div class="user-row glass">
                <div class="col-checkbox">
                    <input type="checkbox" class="user-checkbox" data-index="${n}" onchange="app.updateUserBatchBtn()">
                </div>
                <div class="col-name">
                    <div class="user-avatar" style="background-color: ${U(s.name)}">
                        <span>${this.escapeHtml(s.name.charAt(0).toUpperCase())}</span>
                    </div>
                    <span class="user-name-text">${this.escapeHtml(s.name)}</span>
                    <button class="btn-icon" onclick="app.showRenameUserModal(${n})" title="重命名用户" style="margin-left: 8px;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
                <div class="col-password">
                    <span class="password-text" id="pwd-text-${n}">******</span>
                    <button class="btn-icon" onclick="app.togglePasswordVisibility(${n})" title="密码不回显">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="app.showEditPasswordModal(${n})" title="修改密码">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
                <div class="col-status">
                    <span class="status-badge active">活跃</span>
                </div>
                <div class="col-actions">
                    <button class="btn-delete" onclick="app.deleteUser(${n})" title="删除用户">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join("");let e=document.getElementById("select-all-users");if(e)e.checked=!1;this.updateUserBatchBtn()}filterUsers(){let t=document.getElementById("user-search-input").value.toLowerCase().trim();document.querySelectorAll("#users-list .user-row").forEach((s)=>{if(s.querySelector(".col-name").textContent.toLowerCase().includes(t))s.style.display="";else s.style.display="none"})}showAddUserModal(){let t=document.getElementById("modal"),e=document.getElementById("modal-title"),s=document.getElementById("modal-body");e.textContent="添加用户",s.innerHTML=`
            <form id="add-user-form">
                <div class="form-group">
                    <label>用户名</label>
                    <input type="text" name="name" class="form-input" required />
                </div>
                <div class="form-group">
                    <label>密码</label>
                    <input type="password" name="password" class="form-input" required />
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn-primary">添加</button>
                    <button type="button" class="btn-secondary" onclick="app.closeModal()">取消</button>
                </div>
            </form>
        `,t.classList.remove("hidden"),document.getElementById("add-user-form").addEventListener("submit",async(n)=>{n.preventDefault();let a=new FormData(n.target),o=Object.fromEntries(a);try{await this.request("/api/users",{method:"POST",body:JSON.stringify(o)}),this.closeModal(),this.loadUsers(),this.loadDashboard()}catch(i){showError("添加用户失败: "+i.message)}})}togglePasswordVisibility(t){let e=document.getElementById(`pwd-text-${t}`);if(e)e.textContent="密码不回显"}showEditPasswordModal(t){let e=this.users[t];if(!e)return;this.editingUser=e.name,document.getElementById("edit-password-input").value="",document.getElementById("edit-password-modal").classList.remove("hidden")}async saveNewPassword(){let t=document.getElementById("edit-password-input").value;if(!t){showInfo("请填写新密码");return}try{await this.request("/api/users",{method:"PUT",body:JSON.stringify({name:this.editingUser,password:t})}),document.getElementById("edit-password-modal").classList.add("hidden"),this.loadUsers(),showSuccess("密码修改成功")}catch(e){showError("修改失败: "+e.message)}}async deleteUser(t){let e=this.users[t];if(!e)return;let s=e.name,n=await this.showDeleteUserDialog(s);if(n===null)return;try{await this.request("/api/users",{method:"DELETE",body:JSON.stringify({name:s,deleteData:n})}),this.loadUsers(),this.loadDashboard()}catch(a){showError("删除用户失败: "+a.message)}}async showDeleteUserDialog(t){return new Promise((e)=>{let s=document.getElementById("modal"),n=document.getElementById("modal-title"),a=document.getElementById("modal-body");n.textContent="删除用户确认",a.innerHTML=`
                <div style="padding: 1rem 0;">
                    <p style="margin-bottom: 1rem; font-size: 1rem;">确定要删除用户 <strong>"${this.escapeHtml(t)}"</strong> 吗？</p>
                    <div class="form-group" style="margin-top: 1.5rem;">
                        <label class="checkbox-label" style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="delete-user-data-checkbox" style="margin-right: 0.5rem;">
                            <span>同时删除用户数据文件夹</span>
                        </label>
                        <small style="color: var(--text-secondary); display: block; margin-top: 0.5rem; margin-left: 1.5rem;">
                            ⚠️ 勾选后将永久删除该用户的所有数据（歌单、收藏等），不可恢复！
                        </small>
                    </div>
                </div>
                <div class="form-actions" style="margin-top: 1.5rem;">
                    <button type="button" class="btn-primary" id="confirm-delete-user">确认删除</button>
                    <button type="button" class="btn-secondary" id="cancel-delete-user">取消</button>
                </div>
            `,s.classList.remove("hidden"),document.getElementById("confirm-delete-user").addEventListener("click",()=>{let o=document.getElementById("delete-user-data-checkbox").checked;s.classList.add("hidden"),e(o)}),document.getElementById("cancel-delete-user").addEventListener("click",()=>{s.classList.add("hidden"),e(null)})})}showRenameUserModal(t){let e=this.users[t];if(!e)return;this.editingUser=e.name,document.getElementById("rename-user-input").value=e.name,document.getElementById("rename-user-modal").classList.remove("hidden")}async saveRenameUser(){let t=document.getElementById("rename-user-input").value.trim();if(!t){showInfo("请填写新用户名");return}if(t===this.editingUser){document.getElementById("rename-user-modal").classList.add("hidden");return}try{await this.request("/api/users",{method:"PUT",body:JSON.stringify({name:this.editingUser,newName:t})}),document.getElementById("rename-user-modal").classList.add("hidden"),this.loadUsers(),this.loadDashboard(),showSuccess("用户名修改成功, 请重新在客户端连接")}catch(e){showError("修改失败: "+e.message)}}currentUserData=null;currentPlaylistView=null;async loadUserData(){let t=document.getElementById("data-user-select")?.value,e=document.getElementById("data-stats"),s=document.getElementById("data-content");if(!t){this.renderUserSelectionGrid("data");return}e.classList.add("content-loading"),s.classList.add("content-loading");try{let n=await this.request(`/api/data?user=${encodeURIComponent(t)}`);this.currentUserData={username:t,data:n};let a=0,o=n.defaultList?.length||0,i=n.loveList?.length||0,r=n.userList?.length||0;n.userList?.forEach((c)=>{a+=c.list?.length||0}),a+=o+i,document.getElementById("data-stats").innerHTML=`
                <div class="data-stat-card clickable" role="button" tabindex="0" aria-label="查看总歌曲数" onclick="app.viewAllSongs()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); app.viewAllSongs(); }">
                    <h4>总歌曲数</h4>
                    <div class="value">${a}</div>
                </div>
                <div class="data-stat-card clickable" role="button" tabindex="0" aria-label="查看试听列表" onclick="app.viewSystemList('default')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); app.viewSystemList('default'); }">
                    <h4>试听列表</h4>
                    <div class="value">${o}</div>
                </div>
                <div class="data-stat-card clickable" role="button" tabindex="0" aria-label="查看我的收藏" onclick="app.viewSystemList('love')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); app.viewSystemList('love'); }">
                    <h4>我的收藏</h4>
                    <div class="value">${i}</div>
                </div>
                <div class="data-stat-card clickable" role="button" tabindex="0" aria-label="查看自定义列表" onclick="app.renderPlaylists()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); app.renderPlaylists(); }">
                    <h4>自定义列表</h4>
                    <div class="value">${r}</div>
                </div>
            `,this.renderPlaylists(),e.classList.remove("content-loading"),s.classList.remove("content-loading"),e.classList.add("fade-in"),s.classList.add("fade-in"),setTimeout(()=>{e.classList.remove("fade-in"),s.classList.remove("fade-in")},400)}catch(n){s.innerHTML='<p style="color: var(--accent-error); padding: 2rem; text-align: center;">加载数据失败</p>'}finally{applyMarqueeChecks()}}renderPlaylists(){let t=this.currentUserData?.data;if(!t)return;let e='<div class="playlists-header"><h3>播放列表</h3></div>';if(t.userList&&t.userList.length)e+='<div class="playlists-grid">',t.userList.forEach((s,n)=>{let a=s.list?.length||0;e+=`
                    <div class="playlist-card glass">
                        <div class="playlist-card-header">
                            <div class="playlist-info">
                                <div class="playlist-name">${this.escapeHtml(s.name)}</div>
                                <div class="playlist-meta">
                                    <span class="playlist-id">ID: ${s.id}</span>
                                    <span class="playlist-count">${a} 首</span>
                                </div>
                            </div>
                        </div>
                        <div class="playlist-card-actions">
                            <button class="btn-view" onclick="app.viewPlaylistDetails(${n})">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                                查看详情
                            </button>
                            <button class="btn-delete-playlist" onclick="app.deletePlaylist(${n})">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                                删除歌单
                            </button>
                        </div>
                    </div>
                `}),e+="</div>";else e+='<p style="color: var(--text-secondary); padding: 1rem;">暂无自定义列表</p>';document.getElementById("data-content").innerHTML=e}viewPlaylistDetails(t){let e=this.currentUserData?.data?.userList?.[t];if(!e)return;this.currentPlaylistView=t;let s=`
            <div class="playlist-detail-header">
                <button onclick="app.renderPlaylists()" class="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    返回列表
                </button>
                <div class="playlist-title-row">
                    <h3 id="playlist-name-${t}">${this.escapeHtml(e.name)}</h3>
                    <button onclick="app.editPlaylistName(${t})" class="btn-edit-name" title="编辑名称">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
                <div class="playlist-detail-meta">
                    <span>ID: ${e.id}</span>
                    <span>${e.list?.length||0} 首歌曲</span>
                </div>
            </div>
        `;if(e.list&&e.list.length)s+=`
                <div class="search-sort-bar">
                    <div class="search-box">
                        <input type="text" id="song-search" placeholder="搜索歌曲、歌手..." oninput="app.filterSongs()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                    </div>
                    <select id="song-sort" onchange="app.sortSongs()" class="sort-select">
                        <option value="">默认排序</option>
                        <option value="name-asc">歌曲名 ↑</option>
                        <option value="name-desc">歌曲名 ↓</option>
                        <option value="artist-asc">歌手 ↑</option>
                        <option value="artist-desc">歌手 ↓</option>
                    </select>
                </div>
                <div class="batch-actions">
                    <div class="batch-select-btns">
                        <button onclick="app.selectAllSongs()" class="btn-batch">全选</button>
                        <button onclick="app.invertSelection()" class="btn-batch">反选</button>
                        <button onclick="app.clearSelection()" class="btn-batch">清空</button>
                    </div>
                    <button onclick="app.batchDeleteSongs()" class="btn-batch-delete" id="batch-delete-btn" disabled>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        批量删除 (<span id="selected-count">0</span>)
                    </button>
                </div>
            `,s+='<div class="songs-table">',s+=`
                <div class="songs-table-header with-checkbox">
                    <div class="song-col-checkbox">
                        <input type="checkbox" id="select-all-checkbox" onchange="app.toggleAllSongs(this.checked)">
                    </div>
                    <div class="song-col-index">#</div>
                    <div class="song-col-name">歌曲</div>
                    <div class="song-col-artist">歌手</div>
                    <div class="song-col-actions">操作</div>
                </div>
            `,e.list.forEach((n,a)=>{s+=`
                    <div class="song-row with-checkbox">
                        <div class="song-col-checkbox">
                            <input type="checkbox" class="song-checkbox" data-index="${a}" onchange="app.updateBatchDeleteBtn()">
                        </div>
                        <div class="song-col-index">${a+1}</div>
                        ${this.renderSongNameCell(n)}
                        <div class="song-col-artist">${this.escapeHtml(n.singer||"未知歌手")}</div>
                        <div class="song-col-actions">
                            <button class="btn-delete-song" onclick="app.deleteSong(${t}, ${a})" title="删除歌曲">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `}),s+="</div>";else s+='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">此歌单暂无歌曲</p>';document.getElementById("data-content").innerHTML=s}async deletePlaylist(t){let e=this.currentUserData?.data?.userList?.[t];if(!e)return;if(!await showSelect("删除歌单",`确定要删除歌单 "${e.name}" 吗？
此操作将删除歌单及其中的所有歌曲！`,{danger:!0}))return;try{await this.request("/api/data/delete-playlist",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:e.id})}),showSuccess("删除成功！"),this.loadUserData()}catch(s){showError("删除失败: "+s.message)}}async deleteSong(t,e){let s,n,a,o=!1;if(typeof t==="string"){o=!0;let i=t;s={default:{list:this.currentUserData?.data?.defaultList,name:"试听列表",id:"default"},love:{list:this.currentUserData?.data?.loveList,name:"我的收藏",id:"love"}}[i],n=s?.list?.[e],a=s?.id}else s=this.currentUserData?.data?.userList?.[t],n=s?.list?.[e],a=s?.id;if(!n)return;if(!await showSelect("删除歌曲",`确定要从 "${s.name}" 中删除歌曲 "${n.name}" 吗？`,{danger:!0}))return;try{if(await this.request("/api/data/delete-song",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:a,songIndex:e})}),showSuccess("删除成功！"),await this.loadUserData(),o)this.viewSystemList(t);else this.viewPlaylistDetails(t)}catch(i){showError("删除失败: "+i.message)}}viewSystemList(t){let e=this.currentUserData?.data;if(!e)return;let n={default:{list:e.defaultList,name:"试听列表",id:"default"},love:{list:e.loveList,name:"我的收藏",id:"love"}}[t];if(!n)return;this.currentPlaylistView=t;let a=`
            <div class="playlist-detail-header">
                <button onclick="app.renderPlaylists()" class="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    返回列表
                </button>
                <h3>${n.name}</h3>
                <div class="playlist-detail-meta">
                    <span>系统列表</span>
                    <span>${n.list?.length||0} 首歌曲</span>
                </div>
            </div>
        `;if(n.list&&n.list.length)a+='<div class="songs-table">',a+=`
                <div class="songs-table-header">
                    <div class="song-col-index">#</div>
                    <div class="song-col-name">歌曲</div>
                    <div class="song-col-artist">歌手</div>
                    <div class="song-col-source">来源</div>
                    <div class="song-col-actions">操作</div>
                </div>
            `,n.list.forEach((o,i)=>{a+=`
                    <div class="song-row">
                        <div class="song-col-index">${i+1}</div>
                        ${this.renderSongNameCell(o)}
                        <div class="song-col-artist">${this.escapeHtml(o.singer||"未知歌手")}</div>
                        <div class="song-col-actions">
                            <button class="btn-delete-song" onclick="app.deleteSong('${t}', ${i})" title="删除歌曲">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `}),a+="</div>";else a+='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">此列表暂无歌曲</p>';document.getElementById("data-content").innerHTML=a}async editPlaylistName(t){let e=this.currentUserData?.data?.userList?.[t];if(!e)return;let s=await showInput("编辑歌单名称","请输入新的歌单名称:",{defaultValue:e.name});if(!s||s===e.name)return;try{await this.request("/api/data/rename-playlist",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:e.id,newName:s})}),showSuccess("重命名成功！"),await this.loadUserData(),this.viewPlaylistDetails(t)}catch(n){showError("重命名失败: "+n.message)}}updateBatchDeleteBtn(){let e=document.querySelectorAll(".song-checkbox:checked").length,s=document.getElementById("batch-delete-btn"),n=document.getElementById("selected-count");if(n)n.textContent=e;if(s)s.disabled=e===0;let a=document.querySelectorAll(".song-checkbox"),o=document.getElementById("select-all-checkbox");if(o&&a.length>0)o.checked=e===a.length,o.indeterminate=e>0&&e<a.length}toggleAllSongs(t){document.querySelectorAll(".song-checkbox").forEach((e)=>{e.checked=t}),this.updateBatchDeleteBtn()}selectAllSongs(){document.querySelectorAll(".song-checkbox").forEach((t)=>{t.checked=!0}),this.updateBatchDeleteBtn()}invertSelection(){document.querySelectorAll(".song-checkbox").forEach((t)=>{t.checked=!t.checked}),this.updateBatchDeleteBtn()}clearSelection(){document.querySelectorAll(".song-checkbox").forEach((t)=>{t.checked=!1}),this.updateBatchDeleteBtn()}async batchDeleteSongs(){let t=document.querySelectorAll(".song-checkbox:checked");if(t.length===0)return;let e=this.currentPlaylistView,s=this.currentUserData?.data?.userList?.[e];if(!s)return;if(!await showSelect("批量删除",`确定要删除选中的 ${t.length} 首歌曲吗？`,{danger:!0}))return;try{let n=Array.from(t).map((a)=>parseInt(a.dataset.index)).sort((a,o)=>o-a);await this.request("/api/data/batch-delete-songs",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:s.id,songIndices:n})}),showSuccess("批量删除成功！"),await this.loadUserData(),this.viewPlaylistDetails(e)}catch(n){showError("批量删除失败: "+n.message)}}filterSongs(){let t=document.getElementById("song-search")?.value.toLowerCase()||"";document.querySelectorAll(".song-row").forEach((s)=>{let n=s.querySelector(".song-col-name"),a=s.querySelector(".song-col-artist"),o=n?.textContent.toLowerCase()||"",i=a?.textContent.toLowerCase()||"";if(o.includes(t)||i.includes(t))s.style.display="";else s.style.display="none"})}sortSongs(){let t=document.getElementById("song-sort")?.value;if(!t){if(typeof this.currentPlaylistView==="number")this.viewPlaylistDetails(this.currentPlaylistView);else if(typeof this.currentPlaylistView==="string")this.viewSystemList(this.currentPlaylistView);return}let[e,s]=t.split("-"),n=document.querySelector(".songs-table"),a=Array.from(document.querySelectorAll(".song-row"));a.sort((i,r)=>{let c,l;if(e==="name")c=i.querySelector(".song-col-name")?.textContent||"",l=r.querySelector(".song-col-name")?.textContent||"";else if(e==="artist")c=i.querySelector(".song-col-artist")?.textContent||"",l=r.querySelector(".song-col-artist")?.textContent||"";let u=c.localeCompare(l,"zh-CN");return s==="asc"?u:-u});let o=n.querySelector(".songs-table-header");a.forEach((i)=>n.appendChild(i))}viewAllSongs(){let t=this.currentUserData?.data;if(!t)return;this.currentPlaylistView="all";let e=[];if(t.defaultList&&t.defaultList.length)t.defaultList.forEach((n)=>{e.push({...n,_source:"试听列表"})});if(t.loveList&&t.loveList.length)t.loveList.forEach((n)=>{e.push({...n,_source:"我的收藏"})});if(t.userList&&t.userList.length)t.userList.forEach((n)=>{if(n.list&&n.list.length)n.list.forEach((a)=>{e.push({...a,_source:n.name})})});let s=`
            <div class="playlist-detail-header">
                <button onclick="app.renderPlaylists()" class="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    返回列表
                </button>
                <h3>所有歌曲</h3>
                <div class="playlist-detail-meta">
                    <span>总计 ${e.length} 首歌曲</span>
                </div>
            </div>
        `;if(e.length)s+=`
                <div class="search-sort-bar">
                    <div class="search-box">
                        <input type="text" id="song-search" placeholder="搜索歌曲、歌手..." oninput="app.filterSongs()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                    </div>
                    <select id="song-sort" onchange="app.sortSongs()" class="sort-select">
                        <option value="">默认排序</option>
                        <option value="name-asc">歌曲名 ↑</option>
                        <option value="name-desc">歌曲名 ↓</option>
                        <option value="artist-asc">歌手 ↑</option>
                        <option value="artist-desc">歌手 ↓</option>
                        <option value="source-asc">所属列表 ↑</option>
                        <option value="source-desc">所属列表 ↓</option>
                    </select>
                </div>
            `,s+='<div class="songs-table">',s+=`
                <div class="songs-table-header">
                    <div class="song-col-index">#</div>
                    <div class="song-col-name">歌曲</div>
                    <div class="song-col-artist">歌手</div>
                    <div class="song-col-playlist">所属列表</div>
                </div>
            `,e.forEach((n,a)=>{s+=`
                    <div class="song-row">
                        <div class="song-col-index">${a+1}</div>
                        ${this.renderSongNameCell(n)}
                        <div class="song-col-artist" title="${this.escapeHtml(n.singer||"未知歌手")}">${this.escapeHtml(n.singer||"未知歌手")}</div>
                        <div class="song-col-playlist">${this.escapeHtml(n._source)}</div>
                    </div>
                `}),s+="</div>";else s+='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">暂无歌曲</p>';document.getElementById("data-content").innerHTML=s}async loadConfig(){try{let t=await this.request("/api/config");this.configLoaded=!0;let e=document.getElementById("config-form");if(e.elements.serverName.value=t.serverName||"",e.elements.maxSnapshotNum.value=t.maxSnapshotNum||10,e.elements["list.addMusicLocationType"].value=t["list.addMusicLocationType"]||"top",e.elements["proxy.enabled"].checked=t["proxy.enabled"]||!1,e.elements["proxy.header"].value=t["proxy.header"]||"",e.elements["proxy.all.enabled"])e.elements["proxy.all.enabled"].checked=t["proxy.all.enabled"]||!1;if(e.elements["proxy.all.address"])e.elements["proxy.all.address"].value=t["proxy.all.address"]||"";if(e.elements["user.enablePath"])e.elements["user.enablePath"].checked=t["user.enablePath"]!==!1;if(e.elements["user.enableRoot"])e.elements["user.enableRoot"].checked=t["user.enableRoot"]===!0;if(e.elements["user.enablePublicRestriction"])e.elements["user.enablePublicRestriction"].checked=t["user.enablePublicRestriction"]===!0;if(e.elements["user.enablePublicNonAdminLocalMusic"])e.elements["user.enablePublicNonAdminLocalMusic"].checked=t["user.enablePublicNonAdminLocalMusic"]===!0;if(this.togglePublicNonAdminLocalMusicVisibility(),e.elements["user.enablePublicFavorites"])e.elements["user.enablePublicFavorites"].checked=t["user.enablePublicFavorites"]===!0;if(e.elements["user.enablePublicNonAdminAccess"])e.elements["user.enablePublicNonAdminAccess"].checked=t["user.enablePublicNonAdminAccess"]===!0;if(this.togglePublicNonAdminAccessVisibility(),e.elements["user.enableLoginCacheRestriction"])e.elements["user.enableLoginCacheRestriction"].checked=t["user.enableLoginCacheRestriction"]===!0;if(e.elements["user.enableCacheSizeLimit"])e.elements["user.enableCacheSizeLimit"].checked=t["user.enableCacheSizeLimit"]===!0;if(e.elements["user.cacheSizeLimit"])e.elements["user.cacheSizeLimit"].value=t["user.cacheSizeLimit"]||2000;if(e.elements["system.allowUnsafeVM"])e.elements["system.allowUnsafeVM"].checked=t["system.allowUnsafeVM"]===!0;if(e.elements["singer.sourcePriority"])e.elements["singer.sourcePriority"].value=t["singer.sourcePriority"]||"tx,wy";if(e.elements["frontend.password"].value="",e.elements["frontend.password"].placeholder=t["frontend.passwordConfigured"]?"已配置，留空保持不变":"请设置管理密码",e.elements["player.enableAuth"])e.elements["player.enableAuth"].checked=t["player.enableAuth"]===!0;if(e.elements["player.password"])e.elements["player.password"].value="",e.elements["player.password"].placeholder=t["player.passwordConfigured"]?"已配置，留空保持不变":"请设置播放器密码";if(e.elements["webdav.enable"])e.elements["webdav.enable"].checked=t["webdav.enable"]===!0;if(e.elements["webdav.url"])e.elements["webdav.url"].value=t["webdav.url"]||"";if(e.elements["webdav.username"])e.elements["webdav.username"].value=t["webdav.username"]||"";if(e.elements["webdav.password"])e.elements["webdav.password"].value="",e.elements["webdav.password"].placeholder=t["webdav.passwordConfigured"]?"已配置，留空保持不变":"请输入 WebDAV 密码";if(e.elements["webdav.syncPath"])e.elements["webdav.syncPath"].value=t["webdav.syncPath"]||"/lx-sync";if(e.elements["webdav.backupPath"])e.elements["webdav.backupPath"].value=t["webdav.backupPath"]||"/lx-sync-backups";if(e.elements["sync.interval"])e.elements["sync.interval"].value=t["sync.interval"]||60;if(e.elements["sync.backupInterval"])e.elements["sync.backupInterval"].value=t["sync.backupInterval"]||24;if(e.elements["admin.path"])e.elements["admin.path"].value=t["admin.path"]??"";if(e.elements["player.path"]){let n=t["player.path"]??"/music";e.elements["player.path"].value=n===""?"/":n}let s=document.getElementById("nav-player-link");if(s)s.href=t["player.path"]===""?"/":t["player.path"]??"/music";if(e.elements["subsonic.enable"])e.elements["subsonic.enable"].checked=t["subsonic.enable"]===!0;if(e.elements["subsonic.path"])e.elements["subsonic.path"].value=t["subsonic.path"]||"/rest";if(e.elements["subsonic.enableDebug"])e.elements["subsonic.enableDebug"].checked=t["subsonic.enableDebug"]===!0;if(e.elements["subsonic.onlineSearch"])e.elements["subsonic.onlineSearch"].checked=t["subsonic.onlineSearch"]!==!1;if(e.elements["subsonic.onlineSearchMode"])e.elements["subsonic.onlineSearchMode"].value=t["subsonic.onlineSearchMode"]||"fallback";if(e.elements["subsonic.onlineSearchSources"])e.elements["subsonic.onlineSearchSources"].value=t["subsonic.onlineSearchSources"]||"wy,tx,kw,kg,mg";if(e.elements["subsonic.lyricTranslation"])e.elements["subsonic.lyricTranslation"].checked=t["subsonic.lyricTranslation"]!==!1}catch(t){console.error("Failed to load config:",t)}}togglePublicNonAdminAccessVisibility(){let t=document.querySelector('input[name="user.enablePublicFavorites"]'),e=document.getElementById("public-non-admin-access-wrapper");if(t&&e)e.style.display=t.checked?"block":"none"}togglePublicNonAdminLocalMusicVisibility(){let t=document.querySelector('input[name="user.enablePublicRestriction"]'),e=document.getElementById("public-non-admin-local-music-wrapper");if(t&&e)e.style.display=t.checked?"block":"none"}async saveConfig(t=!1){if(!this.configLoaded)return;let e=document.getElementById("config-form"),s=new FormData(e),n=(s.get("admin.path")||"").trim(),a=(s.get("player.path")||"").trim(),o=document.getElementById("path-conflict-error"),i="";if(!a)i="⚠️ 播放器路径不能为空";else if(!a.startsWith("/"))i="⚠️ 播放器路径必须以 / 开头";else if(n!==""&&!n.startsWith("/"))i="⚠️ 后台路径必须以 / 开头（或留空表示根路径）";else if((n||"/")===(a==="/"?"/":a.replace(/\/+$/,"")))i="⚠️ 后台管理路径与播放器路径不能相同";else if(n.startsWith("/api")||a.startsWith("/api"))i="⚠️ 路径不能以 /api 开头（与 API 路由冲突）";if(o)o.textContent=i,o.style.display=i?"block":"none";if(i)return;let r={serverName:s.get("serverName"),maxSnapshotNum:parseInt(s.get("maxSnapshotNum")),"list.addMusicLocationType":s.get("list.addMusicLocationType"),"proxy.enabled":s.get("proxy.enabled")==="on","proxy.header":s.get("proxy.header"),"proxy.all.enabled":s.get("proxy.all.enabled")==="on","proxy.all.address":s.get("proxy.all.address"),"user.enablePath":s.get("user.enablePath")==="on","user.enableRoot":s.get("user.enableRoot")==="on","user.enablePublicRestriction":s.get("user.enablePublicRestriction")==="on","user.enablePublicNonAdminLocalMusic":s.get("user.enablePublicNonAdminLocalMusic")==="on","user.enablePublicFavorites":s.get("user.enablePublicFavorites")==="on","user.enablePublicNonAdminAccess":s.get("user.enablePublicNonAdminAccess")==="on","user.enableLoginCacheRestriction":s.get("user.enableLoginCacheRestriction")==="on","user.enableCacheSizeLimit":s.get("user.enableCacheSizeLimit")==="on","user.cacheSizeLimit":parseInt(s.get("user.cacheSizeLimit"))||2000,"frontend.password":s.get("frontend.password"),"player.enableAuth":s.get("player.enableAuth")==="on","player.password":s.get("player.password"),"webdav.enable":s.get("webdav.enable")==="on","webdav.url":s.get("webdav.url"),"webdav.username":s.get("webdav.username"),"webdav.password":s.get("webdav.password"),"webdav.syncPath":(s.get("webdav.syncPath")||"").trim()||"/lx-sync","webdav.backupPath":(s.get("webdav.backupPath")||"").trim()||"/lx-sync-backups","sync.interval":parseInt(s.get("sync.interval"))||60,"sync.backupInterval":parseInt(s.get("sync.backupInterval"))||24,"admin.path":n,"player.path":a,"subsonic.enable":s.get("subsonic.enable")==="on","subsonic.path":(s.get("subsonic.path")||"").trim()||"/rest","subsonic.enableDebug":s.get("subsonic.enableDebug")==="on","subsonic.onlineSearch":s.get("subsonic.onlineSearch")==="on","subsonic.onlineSearchMode":s.get("subsonic.onlineSearchMode")||"fallback","subsonic.onlineSearchSources":(s.get("subsonic.onlineSearchSources")||"").trim()||"wy,tx,kw,kg,mg","subsonic.lyricTranslation":s.get("subsonic.lyricTranslation")==="on","singer.sourcePriority":s.get("singer.sourcePriority"),"system.allowUnsafeVM":s.get("system.allowUnsafeVM")==="on"};try{let c=await this.request("/api/config",{method:"POST",body:JSON.stringify(r)});if(r["frontend.password"]&&r["frontend.password"]!==this.password)this.password=r["frontend.password"],v.setItem("lx_auth",r["frontend.password"]);let l=document.getElementById("nav-player-link");if(l)l.href=a===""?"/":a??"/music";if(!t)if(c.warning)showInfo(`配置保存成功！

⚠️ 警告：`+c.warning);else showSuccess("配置保存成功！")}catch(c){if(!t)showError("配置保存失败: "+c.message);throw c}}async loadLogs(){let t=document.getElementById("log-type-select")?.value||"app";try{let e=await this.request(`/api/logs?type=${t}&lines=200`),s=document.getElementById("logs-content");if(e.logs&&e.logs.length)s.innerHTML=e.logs.filter((n)=>n.trim()).map((n)=>`<div class="log-line">${this.escapeHtml(n)}</div>`).join(""),s.scrollTop=s.scrollHeight;else s.innerHTML='<p style="color: var(--text-secondary);">暂无日志</p>'}catch(e){document.getElementById("logs-content").innerHTML='<p style="color: var(--accent-error);">加载日志失败</p>'}}closeModal(){document.getElementById("modal").classList.add("hidden")}async request(t,e={}){let s={headers:{"Content-Type":"application/json","X-Frontend-Auth":this.password}},n=await fetch(""+t,{...s,...e});if(n.status===401)throw this.logout(),Error("Unauthorized");if(!n.ok){let a=await n.text();throw Error(a||"Request failed")}return n.json()}formatUptime(t){if(!t)return"0h";let e=Math.floor(t/3600),s=Math.floor(t%3600/60);if(e>24)return`${Math.floor(e/24)}d ${e%24}h`;return`${e}h ${s}m`}formatMemory(t){return(t/1024/1024).toFixed(1)+" MB"}escapeHtml(t){let e=document.createElement("div");return e.textContent=t,e.innerHTML}async testWebDAV(){try{let t=await this.request("/api/webdav/test",{method:"POST"});if(t.success)showSuccess(`✅ WebDAV连接成功！
`+t.message);else showError(`❌ WebDAV连接失败
`+t.message)}catch(t){showError("❌ 连接失败: "+t.message)}}async testProxy(){let t=document.querySelector('input[name="proxy.all.address"]').value;if(!t){showInfo("请输入代理地址");return}showInfo("正在测试代理，请稍候...");try{let e=await this.request("/api/config/test-proxy",{method:"POST",body:JSON.stringify({address:t})});if(e.success)showSuccess("✅ "+e.message);else showError("❌ "+e.message)}catch(e){showError("❌ 测试失败: "+e.message)}}async backupToWebDAV(){if(!await showSelect("WebDAV 备份","确定要创建全量备份并上传到 WebDAV 吗？"))return;let t=document.getElementById("sync-status-content");t.innerHTML='<p style="color: var(--accent-warning);">正在备份...</p>',this.showProgress(!0);try{if((await this.request("/api/webdav/backup",{method:"POST",body:JSON.stringify({force:!0})})).success)t.innerHTML='<p style="color: var(--accent-success);">✅ 备份成功！</p>',this.loadSyncLogs();else t.innerHTML='<p style="color: var(--accent-error);">❌ 备份失败</p>'}catch(e){t.innerHTML='<p style="color: var(--accent-error);">❌ 备份失败: '+this.escapeHtml(e.message||"")+"</p>"}finally{setTimeout(()=>this.showProgress(!1),3000)}}async restoreFromWebDAV(){if(!await showSelect("WebDAV 恢复",`⚠️ 警告：从云端恢复将覆盖本地所有数据！

确定要继续吗？`,{danger:!0}))return;let t=document.getElementById("sync-status-content");t.innerHTML='<p style="color: var(--accent-warning);">正在从云端恢复数据...</p>';try{if((await this.request("/api/webdav/restore",{method:"POST"})).success)t.innerHTML='<p style="color: var(--accent-success);">✅ 恢复成功！页面将刷新...</p>',setTimeout(()=>location.reload(),2000);else t.innerHTML='<p style="color: var(--accent-error);">❌ 恢复失败</p>'}catch(e){t.innerHTML='<p style="color: var(--accent-error);">❌ 恢复失败: '+this.escapeHtml(e.message||"")+"</p>"}}async syncFilesToWebDAV(){if(!await showSelect("同步文件","确定要强制同步所有文件到 WebDAV 吗？"))return;let t=document.getElementById("sync-status-content");t.innerHTML='<p style="color: var(--accent-warning);">正在同步文件...</p>',this.showProgress(!0);try{if((await this.request("/api/webdav/sync",{method:"POST"})).success)t.innerHTML='<p style="color: var(--accent-success);">✅ 同步成功！</p>',this.loadSyncLogs();else t.innerHTML='<p style="color: var(--accent-error);">❌ 同步失败</p>'}catch(e){t.innerHTML='<p style="color: var(--accent-error);">❌ 同步失败: '+this.escapeHtml(e.message||"")+"</p>"}finally{setTimeout(()=>this.showProgress(!1),3000)}}showProgress(t){let e=document.getElementById("sync-progress-container");if(t)e.classList.remove("hidden"),this.updateProgress(0,"准备中...");else e.classList.add("hidden")}updateProgress(t,e){let s=document.getElementById("progress-bar"),n=document.getElementById("progress-text"),a=document.getElementById("progress-percent");if(s)s.style.width=`${t}%`;if(n)n.textContent=e;if(a)a.textContent=`${Math.round(t)}%`}renderSongTags(t){let e='<div class="song-meta-tags">';if(t.source)e+=`<span class="tag tag-source ${t.source}">${this.escapeHtml(t.source)}</span>`;let s=t.meta?t.meta._qualitys||t.meta.qualitys:null;if(s){if(Array.isArray(s)){if(s.some((n)=>n.type==="flac24bit"))e+='<span class="tag tag-quality hr">Hi-Res</span>';else if(s.some((n)=>n.type==="flac"))e+='<span class="tag tag-quality lossless">SQ</span>';else if(s.some((n)=>n.type==="320k"))e+='<span class="tag tag-quality high">HQ</span>'}else if(s.flac24bit)e+='<span class="tag tag-quality hr">Hi-Res</span>';else if(s.flac)e+='<span class="tag tag-quality lossless">SQ</span>';else if(s["320k"])e+='<span class="tag tag-quality high">HQ</span>'}if(t.interval)e+=`<span class="tag tag-interval">${this.escapeHtml(t.interval)}</span>`;return e+="</div>",e}renderSongNameCell(t){let e=D(t.meta?.picUrl),s=this.escapeHtml(t.name||"未知歌曲"),n=e?`<img src="${this.escapeHtml(e)}" class="song-cover" width="48" height="48" loading="lazy" decoding="async" alt="${s}专辑封面" onerror="this.style.opacity=0">`:'<div class="song-cover" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;">\uD83C\uDFB5</div>',a=t.singer?`<span class="song-singer-mobile">${this.escapeHtml(t.singer)}</span>`:"";return`
            <div class="song-col-name">
                ${n}
                <div class="song-info-wrapper min-w-0">
                    <span class="song-title-text dynamic-marquee truncate" title="${s}">${s}</span>
                    ${a}
                    ${this.renderSongTags(t)}
                </div>
            </div>
        `}initSSE(){}async loadSyncLogs(){try{let t=await this.request("/api/webdav/logs"),e=document.getElementById("sync-logs-content");if(!t.logs||t.logs.length===0){e.innerHTML='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">暂无同步日志</p>';return}e.innerHTML=t.logs.map((s)=>{let n=["upload","download","backup","restore"].includes(s.type)?s.type:"unknown",a=this.escapeHtml(s.file||""),o=this.escapeHtml(s.message||""),i=s.status==="success"?"success":"error";return`
            <div class="sync-log-item">
                <div class="log-info">
                    <span class="log-type log-type-${n}">${this.escapeHtml(this.getLogTypeText(s.type))}</span>
                    <span class="log-file">${a}</span>
                    ${o?`<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${o}</div>`:""}
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span class="log-status log-status-${i}">${s.status==="success"?"成功":"失败"}</span>
                    <span class="log-time">${this.formatTime(s.timestamp)}</span>
                </div>
            </div>
        `}).join("")}catch(t){console.error("Failed to load sync logs:",t)}}getLogTypeText(t){return{upload:"上传",download:"下载",backup:"备份",restore:"恢复"}[t]||t}formatTime(t){let s=Date.now()-t,n=60000,a=3600000,o=86400000;if(s<60000)return"刚刚";if(s<3600000)return Math.floor(s/60000)+"分钟前";if(s<86400000)return Math.floor(s/3600000)+"小时前";return new Date(t).toLocaleString("zh-CN")}formatFileSize(t){if(t<1024)return t+" B";if(t<1048576)return(t/1024).toFixed(1)+" KB";return(t/1024/1024).toFixed(1)+" MB"}formatUptime(t){let e=Math.floor(t/86400),s=Math.floor(t%86400/3600),n=Math.floor(t%3600/60),a=[];if(e>0)a.push(`${e}d`);if(s>0)a.push(`${s}h`);if(n>0)a.push(`${n}m`);if(a.length===0)a.push("0m");return a.join(" ")}bindWebDAVEvents(){document.getElementById("test-webdav-btn")?.addEventListener("click",()=>this.testWebDAV()),document.getElementById("backup-webdav-btn")?.addEventListener("click",()=>this.backupToWebDAV()),document.getElementById("restore-webdav-btn")?.addEventListener("click",()=>this.restoreFromWebDAV()),document.getElementById("sync-files-btn")?.addEventListener("click",()=>this.syncFilesToWebDAV()),document.getElementById("refresh-sync-logs-btn")?.addEventListener("click",()=>this.loadSyncLogs()),document.getElementById("test-proxy-btn")?.addEventListener("click",()=>this.testProxy()),document.getElementById("backup-local-btn")?.addEventListener("click",()=>this.downloadLocalBackup()),document.getElementById("restore-local-btn")?.addEventListener("click",()=>document.getElementById("local-backup-input").click()),document.getElementById("local-backup-input")?.addEventListener("change",(t)=>this.handleLocalRestore(t)),this.initSSE()}async loadSnapshots(){let t=document.getElementById("snapshot-user-select")?.value,e=document.getElementById("snapshots-list");if(!t){this.renderUserSelectionGrid("snapshot");return}e.classList.add("content-loading");try{let s=await this.request(`/api/data/snapshots?user=${encodeURIComponent(t)}`);if(!s.length){e.innerHTML='<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">暂无快照</div>',e.classList.remove("content-loading");return}e.innerHTML=s.map((n)=>{let a=String(n.id||""),o=this.escapeHtml(a),i=h(a);return`
            <div class="snapshot-row">
                <div class="col-time">${new Date(n.time).toLocaleString()}</div>
                <div class="col-id" title="${o}">snapshot_${o}</div>
                <div class="col-size">${this.formatFileSize(n.size)}</div>
                <div class="col-actions snapshot-actions">
                    <button class="btn-download" onclick="app.downloadSnapshot(${i})">
                        <!-- 下载图标 -->
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        下载备份
                    </button>
                    <button class="btn-restore" onclick="app.restoreSnapshot(${i})">
                        <!-- 恢复图标 -->
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1 4 1 10 7 10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        回滚
                    </button>
                    <!-- [新增] 删除按钮 -->
                    <button class="btn-delete" onclick="app.deleteSnapshot(${i})">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        删除
                    </button>
                </div>
            </div>
        `}).join(""),e.classList.remove("content-loading"),e.classList.add("fade-in"),setTimeout(()=>{e.classList.remove("fade-in")},400)}catch(s){console.error(s),showError("加载快照列表失败: "+s.message),e.classList.remove("content-loading")}}triggerUploadSnapshot(){if(!document.getElementById("snapshot-user-select")?.value){showInfo("请先选择用户");return}document.getElementById("snapshot-upload-input").click()}async handleSnapshotUpload(t){let e=t.target.files[0];if(!e)return;let s=document.getElementById("snapshot-user-select")?.value;if(!s)return;t.target.value="";try{let n=await e.text(),{lastModified:a,name:o}=e,i=await fetch(`/api/data/upload-snapshot?user=${encodeURIComponent(s)}&time=${a}&filename=${encodeURIComponent(o)}`,{method:"POST",headers:{"X-Frontend-Auth":this.password},body:n});if(!i.ok){let r=await i.text();throw Error(r||"Upload failed")}showSuccess("上传成功"),this.loadSnapshots()}catch(n){console.error(n),showError("上传失败: "+n.message)}}async deleteSnapshot(t){if(!await showSelect("删除快照","确定要删除这个快照吗？",{danger:!0}))return;let e=document.getElementById("snapshot-user-select")?.value;if(!e)return;try{let s=await fetch(`/api/data/delete-snapshot?user=${encodeURIComponent(e)}`,{method:"POST",headers:{"Content-Type":"application/json","X-Frontend-Auth":this.password},body:JSON.stringify({id:t})});if(!s.ok){let n=await s.text();throw Error(n||"Delete failed")}this.loadSnapshots(),showSuccess("删除成功")}catch(s){console.error(s),showError("删除失败: "+s.message)}}async downloadSnapshot(t){let e=document.getElementById("snapshot-user-select")?.value;if(!e){showInfo("请先选择用户");return}try{let s=await this.request(`/api/data/snapshot?id=${t}&user=${encodeURIComponent(e)}`),n={id:"default",name:"list__name_default"},a={id:"love",name:"list__name_love"},o={type:"playList_v2",data:[{...n,list:s.defaultList||[]},{...a,list:s.loveList||[]},...s.userList||[]]},i=new Blob([JSON.stringify(o,null,2)],{type:"application/json"}),r=URL.createObjectURL(i),c=document.createElement("a");c.href=r,c.download=`lx_backup_${e}_${t.substring(0,8)}.json`,c.click(),URL.revokeObjectURL(r)}catch(s){console.error(s),showError("导出快照失败: "+s.message)}}async downloadLocalBackup(){if(!await showSelect("本地备份",`确定要创建并下载本地全量 ZIP 备份吗？

这可能需要一些时间，取决于数据量。`))return;try{let t=await fetch("/api/backup/download",{headers:{"X-Frontend-Auth":this.password}});if(!t.ok)throw Error(await t.text()||"备份下载失败");let e=await t.blob(),s=URL.createObjectURL(e),n=document.createElement("a");n.href=s;let a=new Date().toISOString().split("T")[0];n.download=`lx-sync-backup-local-${a}.zip`,n.click(),URL.revokeObjectURL(s)}catch(t){showError("下载本地备份失败: "+t.message)}}async handleLocalRestore(t){let e=t.target.files[0];if(!e)return;if(!await showSelect("还原数据",`确定要从上传的 ZIP 文件还原数据吗？

⚠️ 警告：这将覆盖当前的服务器所有数据！
强烈建议在还原前先手动下载一个本地备份。操作不可撤销。`,{danger:!0})){t.target.value="";return}let s=new FormData;s.append("backup",e);let n=document.createElement("div");n.className="overlay",n.style.background="rgba(0,0,0,0.8)",n.innerHTML=`
            <div class="login-box glass" style="padding: 3rem;">
                <div class="status-dot" style="margin: 0 auto 1.5rem; width: 12px; height: 12px;"></div>
                <h2>正在还原数据...</h2>
                <p style="color: var(--text-secondary); margin-top: 1rem;">正在解压并恢复文件，请勿关闭或刷新页面。</p>
            </div>
        `,document.body.appendChild(n);try{let a=await fetch("/api/backup/upload",{method:"POST",headers:{"X-Frontend-Auth":this.password},body:s});if(!a.ok){let i=await a.text();throw Error(i||"Restore failed")}let o=await a.json();showSuccess("\uD83C\uDF89 还原成功！数据已更新，页面将立即刷新以加载最新配置。"),setTimeout(()=>window.location.reload(),1500)}catch(a){console.error(a),showError("本地还原失败: "+a.message),n.remove()}finally{t.target.value=""}}async restoreSnapshot(t){let e=document.getElementById("snapshot-user-select")?.value;if(!e){showInfo("请先选择用户");return}if(!await showSelect("回滚快照",`警告：此操作将把服务器数据回滚到选定的快照状态！

1. 当前所有未保存的更改将丢失。
2. 所有客户端的同步状态将被重置。
3. 客户端连接后，请务必选择【远程覆盖本地】以获取回滚后的数据。

确定要继续吗？`,{danger:!0}))return;try{await this.request(`/api/data/restore-snapshot?user=${encodeURIComponent(e)}`,{method:"POST",body:JSON.stringify({id:t})}),showSuccess("回滚成功！请重启客户端或重新连接同步服务。"),this.loadDashboard()}catch(s){showError("回滚失败: "+s.message)}}async restartServer(){if(!await showSelect("重启服务器",`确定要重启服务器吗？

重启后所有连接的客户端将断开，大约需要几秒钟时间。`,{danger:!0}))return;try{let t=await this.request("/api/restart",{method:"POST"});if(t.success)showSuccess(`服务器正在重启，请稍候...

页面将在 5 秒后自动刷新。`),setTimeout(()=>{window.location.reload()},5000);else showError("重启失败: "+(t.message||"未知错误"))}catch(t){showError("重启请求失败: "+t.message)}}checkWebDAVConfig(t){let e=document.getElementById("webdav-cloud-group"),s=document.getElementById("webdav-config-guide"),n=document.getElementById("webdav-status-section"),a=document.getElementById("webdav-logs-section");if(t)e?.classList.remove("hidden"),s?.classList.add("hidden"),n?.classList.remove("hidden"),a?.classList.remove("hidden");else e?.classList.add("hidden"),s?.classList.remove("hidden"),n?.classList.add("hidden"),a?.classList.add("hidden")}jumpToWebDAVConfig(){this.switchView("config").then(()=>{setTimeout(()=>{let t=document.getElementById("config-card-webdav");if(t)t.scrollIntoView({behavior:"smooth",block:"center"}),t.style.outline="2px solid var(--accent-primary)",t.style.outlineOffset="4px",setTimeout(()=>{t.style.outline="none"},2000)},300)})}}document.addEventListener("click",(t)=>{if(!t.target.closest(".custom-user-selector"))document.querySelectorAll(".selector-dropdown").forEach((e)=>e.classList.add("hidden")),document.querySelectorAll(".custom-user-selector").forEach((e)=>e.classList.remove("open"))});var H=new A;
