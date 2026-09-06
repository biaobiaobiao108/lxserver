function k(e){if(!e)return"var(--accent-primary)";let t=0;for(let n=0;n<e.length;n++)t=e.charCodeAt(n)+((t<<5)-t);return`hsl(${Math.abs(t)%360}, 70%, 45%)`}class w{constructor(){this.password=null,this.currentView="dashboard",this.users=[],this.configLoaded=!1,this.systemCpuHistory=[],this.processCpuHistory=[],this.systemMemHistory=[],this.processMemHistory=[],this.monitorTimer=null,this.init(),this.initVersion()}init(){let e=localStorage.getItem("lx_auth");if(e)this.password=e,this.showApp(),this.loadConfig(),this.loadDashboard();document.getElementById("login-btn")?.addEventListener("click",()=>this.login()),document.getElementById("access-password")?.addEventListener("keypress",(t)=>{if(t.key==="Enter")this.login()}),document.getElementById("logout-btn")?.addEventListener("click",()=>this.logout()),document.querySelectorAll(".nav-item").forEach((t)=>{t.addEventListener("click",(s)=>{let n=t.dataset.view;if(n==="music")return;s.preventDefault(),this.switchView(n)})}),document.querySelectorAll(".action-btn").forEach((t)=>{t.addEventListener("click",()=>{let s=t.dataset.action;this.handleQuickAction(s)})}),document.getElementById("add-user-btn")?.addEventListener("click",()=>this.showAddUserModal()),document.getElementById("refresh-users-btn")?.addEventListener("click",async()=>{try{await this.saveConfig(!0),await this.request("/api/admin/reload",{method:"POST"}),this.loadUsers(),this.loadDashboard(),showSuccess("重载数据成功")}catch(t){showError("重载数据失败: "+t.message)}}),document.getElementById("batch-delete-users-btn")?.addEventListener("click",()=>this.batchDeleteUsers()),document.getElementById("select-all-users")?.addEventListener("change",(t)=>this.toggleAllUsers(t.target.checked)),document.getElementById("save-password-btn")?.addEventListener("click",()=>this.saveNewPassword()),document.getElementById("save-rename-user-btn")?.addEventListener("click",()=>this.saveRenameUser()),document.querySelectorAll(".modal-close").forEach((t)=>{t.addEventListener("click",()=>{document.getElementById("edit-password-modal")?.classList.add("hidden"),document.getElementById("rename-user-modal")?.classList.add("hidden"),document.getElementById("modal")?.classList.add("hidden")})}),document.getElementById("restart-server-btn")?.addEventListener("click",()=>{this.restartServer()}),document.getElementById("refresh-data-btn")?.addEventListener("click",()=>this.loadUserData()),document.getElementById("data-user-select")?.addEventListener("change",()=>this.loadUserData()),document.getElementById("config-form")?.addEventListener("submit",(t)=>{t.preventDefault(),this.saveConfig()}),document.getElementById("reload-config-btn")?.addEventListener("click",async()=>{await this.saveConfig(!0),this.loadConfig()}),document.querySelector('input[name="user.enablePublicFavorites"]')?.addEventListener("change",()=>{this.togglePublicNonAdminAccessVisibility()}),document.querySelector('input[name="user.enablePublicRestriction"]')?.addEventListener("change",()=>{this.togglePublicNonAdminLocalMusicVisibility()}),document.getElementById("refresh-logs-btn")?.addEventListener("click",()=>this.loadLogs()),document.getElementById("log-type-select")?.addEventListener("change",()=>this.loadLogs()),document.querySelector(".modal-close")?.addEventListener("click",()=>this.closeModal()),document.getElementById("modal")?.addEventListener("click",(t)=>{if(t.target.id==="modal")this.closeModal()}),document.getElementById("data-user-select")?.addEventListener("change",()=>this.loadUserData()),this.bindWebDAVEvents(),this.bindFileManagerEvents(),this.deferredPrompt=null,window.addEventListener("beforeinstallprompt",(t)=>{t.preventDefault(),this.deferredPrompt=t;let s=document.getElementById("install-pwa-btn");if(s)s.style.display="inline-flex",s.addEventListener("click",()=>this.installPWA())}),document.getElementById("snapshot-upload-input")?.addEventListener("change",(t)=>this.handleSnapshotUpload(t)),this.initMobileEvents()}initMobileEvents(){let e=document.getElementById("mobile-menu-btn"),t=document.getElementById("mobile-sidebar-overlay"),s=document.querySelector(".sidebar"),n=()=>{if(s.classList.toggle("active"),t.classList.toggle("active"),t.classList.contains("active"))t.classList.remove("hidden");else setTimeout(()=>{if(!t.classList.contains("active"))t.classList.add("hidden")},300)};if(e)e.addEventListener("click",n);if(t)t.addEventListener("click",n);document.querySelectorAll(".nav-item").forEach((a)=>{a.addEventListener("click",()=>{if(window.innerWidth<=768&&s&&s.classList.contains("active"))n()})})}async installPWA(){if(!this.deferredPrompt)return;this.deferredPrompt.prompt();let{outcome:e}=await this.deferredPrompt.userChoice;console.log(`User response to the install prompt: ${e}`),this.deferredPrompt=null,document.getElementById("install-pwa-btn").style.display="none"}async login(){let e=document.getElementById("access-password").value,t=document.getElementById("login-error");if(!e){t.textContent="请输入密码";return}try{if((await this.request("/api/login",{method:"POST",body:JSON.stringify({password:e})})).success)this.password=e,localStorage.setItem("lx_auth",e),this.showApp(),this.loadDashboard();else t.textContent="密码错误"}catch(s){t.textContent="登录失败，请重试"}}logout(){localStorage.removeItem("lx_auth"),location.reload()}showApp(){document.getElementById("login-overlay").classList.add("hidden"),document.getElementById("app").classList.remove("hidden")}async switchView(e){document.querySelectorAll(".nav-item").forEach((s)=>{s.classList.toggle("active",s.dataset.view===e)}),document.querySelectorAll(".view").forEach((s)=>{s.classList.toggle("active",s.id===`view-${e}`)});let t={dashboard:"仪表盘",users:"用户管理",data:"数据查看",config:"系统配置",logs:"系统日志",webdav:"WebDAV同步",files:"文件管理",snapshots:"快照管理",about:"关于"};switch(document.getElementById("page-title").textContent=t[e]||e,this.currentView=e,e){case"dashboard":this.loadDashboard();break;case"users":this.loadUsers();break;case"data":this.loadUserData();break;case"config":this.loadConfig();break;case"logs":this.loadLogs();break;case"webdav":try{let s=await this.request("/api/status");this.checkWebDAVConfig(s.isWebDAVConfigured),this.loadSyncLogs()}catch(s){console.error("Failed to check webdav status:",s)}break;case"snapshots":this.loadSnapshots();break;case"about":this.loadAbout();break;case"files":window.location.href="filemanager.html";return;case"music":window.location.href=window.CONFIG&&window.CONFIG["player.path"]||"/music";return}}handleQuickAction(e){switch(e){case"add-user":this.switchView("users"),setTimeout(()=>this.showAddUserModal(),100);break;case"view-logs":this.switchView("logs");break;case"edit-config":this.switchView("config");break}}async loadAbout(){let e=document.getElementById("about-content");if(!e)return;try{let t=await fetch("/about.md");if(!t.ok)throw Error("Failed to load about.md");let s=await t.text();if(window.marked){let n=window.CONFIG&&window.CONFIG.version||"v1.0.0",a=window.CONFIG&&window.CONFIG.buildHash||"unknown",o=s.replace(/{{version}}/g,n);o=o.replace(/{{buildHash}}/g,a),e.innerHTML=window.marked.parse(o)}else e.innerText=s}catch(t){console.error("Failed to load about content:",t),e.innerHTML='<p style="color: var(--accent-error); text-align: center;">加载关于页面失败</p>'}}checkForUpdates(){if(window.LxNotification&&window.LxNotification.checkUpdates)window.LxNotification.checkUpdates(!0);else showInfo("通知服务未就绪，请稍后重试")}initVersion(){if(window.CONFIG&&window.CONFIG.version){let t=document.getElementById("console-version");if(t)t.textContent=window.CONFIG.version,t.classList.remove("hidden");let s=document.getElementById("sidebar-version");if(s)s.textContent=window.CONFIG.version,s.classList.remove("hidden")}let e=document.getElementById("nav-player-link");if(e&&window.CONFIG&&window.CONFIG["player.path"])e.href=window.CONFIG["player.path"]}async loadDashboard(){this.updateGreeting();try{let e=await this.request("/api/status");document.getElementById("stat-users").textContent=e.users,document.getElementById("stat-devices").textContent=e.devices,document.getElementById("stat-cpu").textContent=e.cpuUsage+"%",document.getElementById("stat-memory").textContent=this.formatFileSize(e.memory),this.updateMonitorUI(e);let t=await this.request("/api/users");this.allUsers=t,this.renderAllUserSelectors(),this.startMonitor()}catch(e){console.error("Failed to load dashboard:",e)}}updateGreeting(){let e=new Date().getHours(),t="你好";if(e<6)t="深夜好";else if(e<9)t="早安";else if(e<12)t="上午好";else if(e<14)t="中午好";else if(e<18)t="下午好";else if(e<22)t="晚上好";else t="深夜好";let s=document.getElementById("greeting-text");if(s)s.textContent=t;let n=document.getElementById("dashboard-date");if(n){let a={weekday:"long",year:"numeric",month:"long",day:"numeric"};n.textContent="今天是 "+new Date().toLocaleDateString("zh-CN",a)}}startMonitor(){if(this.monitorTimer)return;this.monitorTimer=setInterval(async()=>{if(this.currentView!=="dashboard"||!this.password){clearInterval(this.monitorTimer),this.monitorTimer=null;return}try{let e=await this.request("/api/status");this.updateMonitorUI(e)}catch(e){console.error("Monitor refresh failed:",e)}},3000)}updateMonitorUI(e){let t=parseFloat(e.cpuUsage)||0,s=parseFloat(e.processCpuUsage)||0,n=document.getElementById("stat-cpu"),a=document.getElementById("stat-process-cpu");if(n)n.textContent=t.toFixed(2)+"%";if(a)a.textContent=s.toFixed(2)+"%";let o=document.getElementById("monitor-cpu-progress"),i=document.getElementById("monitor-cpu-val"),r=document.getElementById("monitor-process-cpu-val");if(o)o.style.width=Math.max(t,s)+"%";if(i)i.textContent=t.toFixed(2)+"%";if(r)r.textContent=s.toFixed(2)+"%";if(this.systemCpuHistory.push(t),this.processCpuHistory.push(s),this.systemCpuHistory.length>20)this.systemCpuHistory.shift(),this.processCpuHistory.shift();this.renderMultiLineChart("cpu-chart",[{data:this.systemCpuHistory,color:"rgba(59, 130, 246, 0.4)",fill:!0,label:"System"},{data:this.processCpuHistory,color:"#a855f7",fill:!1,label:"Process",strokeWidth:3}]);let c=parseFloat(e.systemMemoryUsage)||0,l=parseFloat(e.processMemoryUsage)||0,u=document.getElementById("stat-memory-percent"),d=document.getElementById("stat-process-memory-percent"),h=document.getElementById("stat-memory");if(u)u.textContent=c.toFixed(2)+"%";if(d)d.textContent=l.toFixed(2)+"%";if(h)h.textContent=this.formatFileSize(e.memory);let m=document.getElementById("monitor-mem-progress"),p=document.getElementById("monitor-mem-val"),g=document.getElementById("monitor-process-mem-val");if(m)m.style.width=c+"%";if(p)p.textContent=c.toFixed(2)+"%";if(g)g.textContent=l.toFixed(2)+"%";if(this.systemMemHistory.push(c),this.processMemHistory.push(l),this.systemMemHistory.length>20)this.systemMemHistory.shift(),this.processMemHistory.shift();this.renderMultiLineChart("mem-chart",[{data:this.systemMemHistory,color:"rgba(16, 185, 129, 0.4)",fill:!0,label:"System"},{data:this.processMemHistory,color:"#3b82f6",fill:!1,label:"Process",strokeWidth:3}]);let y=document.getElementById("stat-users"),v=document.getElementById("stat-devices"),f=document.getElementById("stat-uptime");if(y)y.textContent=e.users;if(v)v.textContent=e.devices;if(f)f.textContent=this.formatUptime(e.uptime);let b=document.getElementById("stat-cpu-info");if(b){let E=(e.cpuSpeed/1000).toFixed(1);b.textContent=`${e.cpus} Cores @ ${E}GHz`}}renderMultiLineChart(e,t){let s=document.getElementById(e);if(!s)return;let n=200,a=60,o=5,i="";t.forEach((r,c)=>{if(r.data.length<2)return;let l=r.data.map((d,h)=>{let m=h/(r.data.length-1)*n,p=a-Math.max(d,2)/100*(a-o*2)-o;return{x:m,y:p}}),u=`M ${l[0].x} ${l[0].y}`;for(let d=0;d<l.length-1;d++){let h=(l[d].x+l[d+1].x)/2,m=(l[d].y+l[d+1].y)/2;u+=` Q ${l[d].x} ${l[d].y} ${h} ${m}`}if(u+=` L ${l[l.length-1].x} ${l[l.length-1].y}`,r.fill){let d=u+` L ${n} ${a} L 0 ${a} Z`;i+=`
                    <defs>
                        <linearGradient id="grad-${e}-${c}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:${r.color};stop-opacity:0.3" />
                            <stop offset="100%" style="stop-color:${r.color};stop-opacity:0" />
                        </linearGradient>
                    </defs>
                    <path d="${d}" fill="url(#grad-${e}-${c})" />
                `}i+=`<path d="${u}" fill="none" stroke="${r.color}" stroke-width="${r.strokeWidth||2}" stroke-linecap="round" />`}),s.innerHTML=i}renderAllUserSelectors(){if(this.renderUserDropdown("data"),this.renderUserDropdown("snapshot"),!document.getElementById("data-user-select").value)this.renderUserSelectionGrid("data");if(!document.getElementById("snapshot-user-select").value)this.renderUserSelectionGrid("snapshot")}toggleUserDropdown(e){let t=document.getElementById(`${e}-user-selector`),s=document.getElementById(`${e}-user-dropdown`),n=!s.classList.contains("hidden");if(document.querySelectorAll(".selector-dropdown").forEach((a)=>a.classList.add("hidden")),document.querySelectorAll(".custom-user-selector").forEach((a)=>a.classList.remove("open")),!n)s.classList.remove("hidden"),t.classList.add("open")}renderUserDropdown(e){let t=document.getElementById(`${e}-user-dropdown`);if(!t||!this.allUsers)return;let s=document.getElementById(`${e}-user-select`).value;t.innerHTML=this.allUsers.map((n)=>{let a=n.name==="_open",o=a?"公开用户 (_open)":this.escapeHtml(n.name),i=a?"\uD83C\uDF10":this.escapeHtml(n.name.charAt(0).toUpperCase()),r=a?"background: linear-gradient(135deg, #10b981, #059669); font-size:12px;":"";return`
            <div class="dropdown-item ${n.name===s?"active":""}" 
                 onclick="app.selectUser('${e}', '${this.escapeHtml(n.name)}')">
                <div class="dropdown-avatar" style="${r}">${i}</div>
                <span>${o}</span>
                ${n.name===s?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;margin-left:auto;"><polyline points="20 6 9 17 4 12"></polyline></svg>':""}
            </div>
        `}).join("")}renderUserSelectionGrid(e){let t=e==="data"?document.getElementById("data-content"):document.getElementById("snapshots-list");if(!t||!this.allUsers)return;if(e==="data")document.getElementById("data-stats").innerHTML="";t.innerHTML=`
            <div class="user-selection-grid fade-in">
                ${this.allUsers.map((s)=>{let n=s.name==="_open",a=n?"公开用户 (_open)":this.escapeHtml(s.name),o=n?"公共数据与歌单":"用户数据",i=n?"background: linear-gradient(135deg, #10b981, #059669); font-size: 1.5rem;":"",r=n?"\uD83C\uDF10":this.escapeHtml(s.name.charAt(0).toUpperCase());return`
                    <div class="user-select-card" onclick="app.selectUser('${e}', '${this.escapeHtml(s.name)}')">
                        <div class="avatar" style="${i}">${r}</div>
                        <div class="name">${a}</div>
                        <div class="role">${o}</div>
                    </div>
                `}).join("")}
            </div>
        `}selectUser(e,t){let s=document.getElementById(`${e}-user-select`),n=document.querySelector(`#${e}-user-selector .selected-username`);if(s.value=t,n.textContent=t==="_open"?"公开用户 (_open)":t,document.getElementById(`${e}-user-dropdown`).classList.add("hidden"),document.getElementById(`${e}-user-selector`).classList.remove("open"),this.renderUserDropdown(e),e==="data")this.loadUserData();else this.loadSnapshots()}async loadUsers(){try{let e=await this.request("/api/users");this.users=e.filter((t)=>t.name!=="_open"),this.renderUsers()}catch(e){console.error("Failed to load users:",e)}}async batchDeleteUsers(){let e=document.querySelectorAll(".user-checkbox:checked"),t=Array.from(e).map((n)=>{let a=parseInt(n.dataset.index);return this.users[a]?.name}).filter((n)=>n);if(!t.length)return;let s=await this.showBatchDeleteUserDialog(t.length);if(s===null)return;try{await this.request("/api/users",{method:"DELETE",body:JSON.stringify({names:t,deleteData:s})}),this.loadUsers(),showSuccess("批量删除成功")}catch(n){showError("删除失败: "+n.message)}}async showBatchDeleteUserDialog(e){return new Promise((t)=>{let s=document.getElementById("modal"),n=document.getElementById("modal-title"),a=document.getElementById("modal-body");n.textContent="批量删除用户确认",a.innerHTML=`
                <div style="padding: 1rem 0;">
                    <p style="margin-bottom: 1rem; font-size: 1rem;">确定要删除选中的 <strong>${e}</strong> 个用户吗？</p>
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
            `,s.classList.remove("hidden"),document.getElementById("confirm-batch-delete-users").addEventListener("click",()=>{let o=document.getElementById("batch-delete-user-data-checkbox").checked;s.classList.add("hidden"),t(o)}),document.getElementById("cancel-batch-delete-users").addEventListener("click",()=>{s.classList.add("hidden"),t(null)})})}toggleAllUsers(e){document.querySelectorAll(".user-checkbox").forEach((s)=>{s.checked=e}),this.updateUserBatchBtn()}updateUserBatchBtn(){let e=document.querySelectorAll(".user-checkbox:checked"),t=document.getElementById("batch-delete-users-btn"),s=document.getElementById("user-selected-count");if(t&&s)if(e.length>0)t.style.display="inline-flex",s.textContent=e.length;else t.style.display="none";let n=document.getElementById("select-all-users");if(n){let a=document.querySelectorAll(".user-checkbox");if(a.length>0)n.checked=e.length===a.length;else n.checked=!1}}renderUsers(){let e=document.getElementById("users-list");if(!this.users.length){e.innerHTML=`
                <div class="glass" style="padding: 3rem; text-align: center; width: 100%;">
                    <p style="color: var(--text-secondary);">暂无用户，点击上方按钮添加用户</p>
                </div>
            `;return}e.innerHTML=this.users.map((s,n)=>`
            <div class="user-row glass">
                <div class="col-checkbox">
                    <input type="checkbox" class="user-checkbox" data-index="${n}" onchange="app.updateUserBatchBtn()">
                </div>
                <div class="col-name">
                    <div class="user-avatar" style="background-color: ${k(s.name)}">
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
                    <button class="btn-icon" onclick="app.togglePasswordVisibility(${n})" title="显示/隐藏">
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
        `).join("");let t=document.getElementById("select-all-users");if(t)t.checked=!1;this.updateUserBatchBtn()}filterUsers(){let e=document.getElementById("user-search-input").value.toLowerCase().trim();document.querySelectorAll("#users-list .user-row").forEach((s)=>{if(s.querySelector(".col-name").textContent.toLowerCase().includes(e))s.style.display="";else s.style.display="none"})}showAddUserModal(){let e=document.getElementById("modal"),t=document.getElementById("modal-title"),s=document.getElementById("modal-body");t.textContent="添加用户",s.innerHTML=`
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
        `,e.classList.remove("hidden"),document.getElementById("add-user-form").addEventListener("submit",async(n)=>{n.preventDefault();let a=new FormData(n.target),o=Object.fromEntries(a);try{await this.request("/api/users",{method:"POST",body:JSON.stringify(o)}),this.closeModal(),this.loadUsers(),this.loadDashboard()}catch(i){showError("添加用户失败: "+i.message)}})}togglePasswordVisibility(e){let t=this.users[e];if(!t)return;let s=document.getElementById(`pwd-text-${e}`);if(s.textContent==="******")s.textContent=t.password;else s.textContent="******"}showEditPasswordModal(e){let t=this.users[e];if(!t)return;this.editingUser=t.name,document.getElementById("edit-password-input").value="",document.getElementById("edit-password-modal").classList.remove("hidden")}async saveNewPassword(){let e=document.getElementById("edit-password-input").value;if(!e){showInfo("请填写新密码");return}try{await this.request("/api/users",{method:"PUT",body:JSON.stringify({name:this.editingUser,password:e})}),document.getElementById("edit-password-modal").classList.add("hidden"),this.loadUsers(),showSuccess("密码修改成功")}catch(t){showError("修改失败: "+t.message)}}async deleteUser(e){let t=this.users[e];if(!t)return;let s=t.name,n=await this.showDeleteUserDialog(s);if(n===null)return;try{await this.request("/api/users",{method:"DELETE",body:JSON.stringify({name:s,deleteData:n})}),this.loadUsers(),this.loadDashboard()}catch(a){showError("删除用户失败: "+a.message)}}async showDeleteUserDialog(e){return new Promise((t)=>{let s=document.getElementById("modal"),n=document.getElementById("modal-title"),a=document.getElementById("modal-body");n.textContent="删除用户确认",a.innerHTML=`
                <div style="padding: 1rem 0;">
                    <p style="margin-bottom: 1rem; font-size: 1rem;">确定要删除用户 <strong>"${this.escapeHtml(e)}"</strong> 吗？</p>
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
            `,s.classList.remove("hidden"),document.getElementById("confirm-delete-user").addEventListener("click",()=>{let o=document.getElementById("delete-user-data-checkbox").checked;s.classList.add("hidden"),t(o)}),document.getElementById("cancel-delete-user").addEventListener("click",()=>{s.classList.add("hidden"),t(null)})})}showRenameUserModal(e){let t=this.users[e];if(!t)return;this.editingUser=t.name,document.getElementById("rename-user-input").value=t.name,document.getElementById("rename-user-modal").classList.remove("hidden")}async saveRenameUser(){let e=document.getElementById("rename-user-input").value.trim();if(!e){showInfo("请填写新用户名");return}if(e===this.editingUser){document.getElementById("rename-user-modal").classList.add("hidden");return}try{await this.request("/api/users",{method:"PUT",body:JSON.stringify({name:this.editingUser,newName:e})}),document.getElementById("rename-user-modal").classList.add("hidden"),this.loadUsers(),this.loadDashboard(),showSuccess("用户名修改成功, 请重新在客户端连接")}catch(t){showError("修改失败: "+t.message)}}currentUserData=null;currentPlaylistView=null;async loadUserData(){let e=document.getElementById("data-user-select")?.value,t=document.getElementById("data-stats"),s=document.getElementById("data-content");if(!e){this.renderUserSelectionGrid("data");return}t.classList.add("content-loading"),s.classList.add("content-loading");try{let n=await this.request(`/api/data?user=${encodeURIComponent(e)}`);this.currentUserData={username:e,data:n};let a=0,o=n.defaultList?.length||0,i=n.loveList?.length||0,r=n.userList?.length||0;n.userList?.forEach((c)=>{a+=c.list?.length||0}),a+=o+i,document.getElementById("data-stats").innerHTML=`
                <div class="data-stat-card clickable" onclick="app.viewAllSongs()">
                    <h4>总歌曲数</h4>
                    <div class="value">${a}</div>
                </div>
                <div class="data-stat-card clickable" onclick="app.viewSystemList('default')">
                    <h4>试听列表</h4>
                    <div class="value">${o}</div>
                </div>
                <div class="data-stat-card clickable" onclick="app.viewSystemList('love')">
                    <h4>我的收藏</h4>
                    <div class="value">${i}</div>
                </div>
                <div class="data-stat-card clickable" onclick="app.renderPlaylists()">
                    <h4>自定义列表</h4>
                    <div class="value">${r}</div>
                </div>
            `,this.renderPlaylists(),t.classList.remove("content-loading"),s.classList.remove("content-loading"),t.classList.add("fade-in"),s.classList.add("fade-in"),setTimeout(()=>{t.classList.remove("fade-in"),s.classList.remove("fade-in")},400)}catch(n){s.innerHTML='<p style="color: var(--accent-error); padding: 2rem; text-align: center;">加载数据失败</p>'}finally{applyMarqueeChecks()}}renderPlaylists(){let e=this.currentUserData?.data;if(!e)return;let t='<div class="playlists-header"><h3>播放列表</h3></div>';if(e.userList&&e.userList.length)t+='<div class="playlists-grid">',e.userList.forEach((s,n)=>{let a=s.list?.length||0;t+=`
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
                `}),t+="</div>";else t+='<p style="color: var(--text-secondary); padding: 1rem;">暂无自定义列表</p>';document.getElementById("data-content").innerHTML=t}viewPlaylistDetails(e){let t=this.currentUserData?.data?.userList?.[e];if(!t)return;this.currentPlaylistView=e;let s=`
            <div class="playlist-detail-header">
                <button onclick="app.renderPlaylists()" class="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    返回列表
                </button>
                <div class="playlist-title-row">
                    <h3 id="playlist-name-${e}">${this.escapeHtml(t.name)}</h3>
                    <button onclick="app.editPlaylistName(${e})" class="btn-edit-name" title="编辑名称">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
                <div class="playlist-detail-meta">
                    <span>ID: ${t.id}</span>
                    <span>${t.list?.length||0} 首歌曲</span>
                </div>
            </div>
        `;if(t.list&&t.list.length)s+=`
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
            `,t.list.forEach((n,a)=>{s+=`
                    <div class="song-row with-checkbox">
                        <div class="song-col-checkbox">
                            <input type="checkbox" class="song-checkbox" data-index="${a}" onchange="app.updateBatchDeleteBtn()">
                        </div>
                        <div class="song-col-index">${a+1}</div>
                        ${this.renderSongNameCell(n)}
                        <div class="song-col-artist">${this.escapeHtml(n.singer||"未知歌手")}</div>
                        <div class="song-col-actions">
                            <button class="btn-delete-song" onclick="app.deleteSong(${e}, ${a})" title="删除歌曲">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `}),s+="</div>";else s+='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">此歌单暂无歌曲</p>';document.getElementById("data-content").innerHTML=s}async deletePlaylist(e){let t=this.currentUserData?.data?.userList?.[e];if(!t)return;if(!await showSelect("删除歌单",`确定要删除歌单 "${t.name}" 吗？
此操作将删除歌单及其中的所有歌曲！`,{danger:!0}))return;try{await this.request("/api/data/delete-playlist",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:t.id})}),showSuccess("删除成功！"),this.loadUserData()}catch(s){showError("删除失败: "+s.message)}}async deleteSong(e,t){let s,n,a,o=!1;if(typeof e==="string"){o=!0;let i=e;s={default:{list:this.currentUserData?.data?.defaultList,name:"试听列表",id:"default"},love:{list:this.currentUserData?.data?.loveList,name:"我的收藏",id:"love"}}[i],n=s?.list?.[t],a=s?.id}else s=this.currentUserData?.data?.userList?.[e],n=s?.list?.[t],a=s?.id;if(!n)return;if(!await showSelect("删除歌曲",`确定要从 "${s.name}" 中删除歌曲 "${n.name}" 吗？`,{danger:!0}))return;try{if(await this.request("/api/data/delete-song",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:a,songIndex:t})}),showSuccess("删除成功！"),await this.loadUserData(),o)this.viewSystemList(e);else this.viewPlaylistDetails(e)}catch(i){showError("删除失败: "+i.message)}}viewSystemList(e){let t=this.currentUserData?.data;if(!t)return;let n={default:{list:t.defaultList,name:"试听列表",id:"default"},love:{list:t.loveList,name:"我的收藏",id:"love"}}[e];if(!n)return;this.currentPlaylistView=e;let a=`
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
                            <button class="btn-delete-song" onclick="app.deleteSong('${e}', ${i})" title="删除歌曲">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `}),a+="</div>";else a+='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">此列表暂无歌曲</p>';document.getElementById("data-content").innerHTML=a}async editPlaylistName(e){let t=this.currentUserData?.data?.userList?.[e];if(!t)return;let s=await showInput("编辑歌单名称","请输入新的歌单名称:",{defaultValue:t.name});if(!s||s===t.name)return;try{await this.request("/api/data/rename-playlist",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:t.id,newName:s})}),showSuccess("重命名成功！"),await this.loadUserData(),this.viewPlaylistDetails(e)}catch(n){showError("重命名失败: "+n.message)}}updateBatchDeleteBtn(){let t=document.querySelectorAll(".song-checkbox:checked").length,s=document.getElementById("batch-delete-btn"),n=document.getElementById("selected-count");if(n)n.textContent=t;if(s)s.disabled=t===0;let a=document.querySelectorAll(".song-checkbox"),o=document.getElementById("select-all-checkbox");if(o&&a.length>0)o.checked=t===a.length,o.indeterminate=t>0&&t<a.length}toggleAllSongs(e){document.querySelectorAll(".song-checkbox").forEach((t)=>{t.checked=e}),this.updateBatchDeleteBtn()}selectAllSongs(){document.querySelectorAll(".song-checkbox").forEach((e)=>{e.checked=!0}),this.updateBatchDeleteBtn()}invertSelection(){document.querySelectorAll(".song-checkbox").forEach((e)=>{e.checked=!e.checked}),this.updateBatchDeleteBtn()}clearSelection(){document.querySelectorAll(".song-checkbox").forEach((e)=>{e.checked=!1}),this.updateBatchDeleteBtn()}async batchDeleteSongs(){let e=document.querySelectorAll(".song-checkbox:checked");if(e.length===0)return;let t=this.currentPlaylistView,s=this.currentUserData?.data?.userList?.[t];if(!s)return;if(!await showSelect("批量删除",`确定要删除选中的 ${e.length} 首歌曲吗？`,{danger:!0}))return;try{let n=Array.from(e).map((a)=>parseInt(a.dataset.index)).sort((a,o)=>o-a);await this.request("/api/data/batch-delete-songs",{method:"POST",body:JSON.stringify({username:this.currentUserData.username,playlistId:s.id,songIndices:n})}),showSuccess("批量删除成功！"),await this.loadUserData(),this.viewPlaylistDetails(t)}catch(n){showError("批量删除失败: "+n.message)}}filterSongs(){let e=document.getElementById("song-search")?.value.toLowerCase()||"";document.querySelectorAll(".song-row").forEach((s)=>{let n=s.querySelector(".song-col-name"),a=s.querySelector(".song-col-artist"),o=n?.textContent.toLowerCase()||"",i=a?.textContent.toLowerCase()||"";if(o.includes(e)||i.includes(e))s.style.display="";else s.style.display="none"})}sortSongs(){let e=document.getElementById("song-sort")?.value;if(!e){if(typeof this.currentPlaylistView==="number")this.viewPlaylistDetails(this.currentPlaylistView);else if(typeof this.currentPlaylistView==="string")this.viewSystemList(this.currentPlaylistView);return}let[t,s]=e.split("-"),n=document.querySelector(".songs-table"),a=Array.from(document.querySelectorAll(".song-row"));a.sort((i,r)=>{let c,l;if(t==="name")c=i.querySelector(".song-col-name")?.textContent||"",l=r.querySelector(".song-col-name")?.textContent||"";else if(t==="artist")c=i.querySelector(".song-col-artist")?.textContent||"",l=r.querySelector(".song-col-artist")?.textContent||"";let u=c.localeCompare(l,"zh-CN");return s==="asc"?u:-u});let o=n.querySelector(".songs-table-header");a.forEach((i)=>n.appendChild(i))}viewAllSongs(){let e=this.currentUserData?.data;if(!e)return;this.currentPlaylistView="all";let t=[];if(e.defaultList&&e.defaultList.length)e.defaultList.forEach((n)=>{t.push({...n,_source:"试听列表"})});if(e.loveList&&e.loveList.length)e.loveList.forEach((n)=>{t.push({...n,_source:"我的收藏"})});if(e.userList&&e.userList.length)e.userList.forEach((n)=>{if(n.list&&n.list.length)n.list.forEach((a)=>{t.push({...a,_source:n.name})})});let s=`
            <div class="playlist-detail-header">
                <button onclick="app.renderPlaylists()" class="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    返回列表
                </button>
                <h3>所有歌曲</h3>
                <div class="playlist-detail-meta">
                    <span>总计 ${t.length} 首歌曲</span>
                </div>
            </div>
        `;if(t.length)s+=`
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
            `,t.forEach((n,a)=>{s+=`
                    <div class="song-row">
                        <div class="song-col-index">${a+1}</div>
                        ${this.renderSongNameCell(n)}
                        <div class="song-col-artist" title="${this.escapeHtml(n.singer||"未知歌手")}">${this.escapeHtml(n.singer||"未知歌手")}</div>
                        <div class="song-col-playlist">${this.escapeHtml(n._source)}</div>
                    </div>
                `}),s+="</div>";else s+='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">暂无歌曲</p>';document.getElementById("data-content").innerHTML=s}async loadConfig(){try{let e=await this.request("/api/config");this.configLoaded=!0;let t=document.getElementById("config-form");if(t.elements.serverName.value=e.serverName||"",t.elements.maxSnapshotNum.value=e.maxSnapshotNum||10,t.elements["list.addMusicLocationType"].value=e["list.addMusicLocationType"]||"top",t.elements["proxy.enabled"].checked=e["proxy.enabled"]||!1,t.elements["proxy.header"].value=e["proxy.header"]||"",t.elements["proxy.all.enabled"])t.elements["proxy.all.enabled"].checked=e["proxy.all.enabled"]||!1;if(t.elements["proxy.all.address"])t.elements["proxy.all.address"].value=e["proxy.all.address"]||"";if(t.elements["user.enablePath"])t.elements["user.enablePath"].checked=e["user.enablePath"]!==!1;if(t.elements["user.enableRoot"])t.elements["user.enableRoot"].checked=e["user.enableRoot"]===!0;if(t.elements["user.enablePublicRestriction"])t.elements["user.enablePublicRestriction"].checked=e["user.enablePublicRestriction"]===!0;if(t.elements["user.enablePublicNonAdminLocalMusic"])t.elements["user.enablePublicNonAdminLocalMusic"].checked=e["user.enablePublicNonAdminLocalMusic"]===!0;if(this.togglePublicNonAdminLocalMusicVisibility(),t.elements["user.enablePublicFavorites"])t.elements["user.enablePublicFavorites"].checked=e["user.enablePublicFavorites"]===!0;if(t.elements["user.enablePublicNonAdminAccess"])t.elements["user.enablePublicNonAdminAccess"].checked=e["user.enablePublicNonAdminAccess"]===!0;if(this.togglePublicNonAdminAccessVisibility(),t.elements["user.enableLoginCacheRestriction"])t.elements["user.enableLoginCacheRestriction"].checked=e["user.enableLoginCacheRestriction"]===!0;if(t.elements["user.enableCacheSizeLimit"])t.elements["user.enableCacheSizeLimit"].checked=e["user.enableCacheSizeLimit"]===!0;if(t.elements["user.cacheSizeLimit"])t.elements["user.cacheSizeLimit"].value=e["user.cacheSizeLimit"]||2000;if(t.elements["system.allowUnsafeVM"])t.elements["system.allowUnsafeVM"].checked=e["system.allowUnsafeVM"]===!0;if(t.elements["singer.sourcePriority"])t.elements["singer.sourcePriority"].value=e["singer.sourcePriority"]||"tx,wy";if(t.elements["frontend.password"].value=e["frontend.password"]||"",t.elements["player.enableAuth"])t.elements["player.enableAuth"].checked=e["player.enableAuth"]===!0;if(t.elements["player.password"])t.elements["player.password"].value=e["player.password"]||"";if(t.elements["webdav.enable"])t.elements["webdav.enable"].checked=e["webdav.enable"]===!0;if(t.elements["webdav.url"])t.elements["webdav.url"].value=e["webdav.url"]||"";if(t.elements["webdav.username"])t.elements["webdav.username"].value=e["webdav.username"]||"";if(t.elements["webdav.password"])t.elements["webdav.password"].value=e["webdav.password"]||"";if(t.elements["webdav.syncPath"])t.elements["webdav.syncPath"].value=e["webdav.syncPath"]||"/lx-sync";if(t.elements["webdav.backupPath"])t.elements["webdav.backupPath"].value=e["webdav.backupPath"]||"/lx-sync-backups";if(t.elements["sync.interval"])t.elements["sync.interval"].value=e["sync.interval"]||60;if(t.elements["sync.backupInterval"])t.elements["sync.backupInterval"].value=e["sync.backupInterval"]||24;if(t.elements["admin.path"])t.elements["admin.path"].value=e["admin.path"]??"";if(t.elements["player.path"]){let n=e["player.path"]??"/music";t.elements["player.path"].value=n===""?"/":n}let s=document.getElementById("nav-player-link");if(s)s.href=e["player.path"]===""?"/":e["player.path"]??"/music";if(t.elements["subsonic.enable"])t.elements["subsonic.enable"].checked=e["subsonic.enable"]===!0;if(t.elements["subsonic.path"])t.elements["subsonic.path"].value=e["subsonic.path"]||"/rest";if(t.elements["subsonic.enableDebug"])t.elements["subsonic.enableDebug"].checked=e["subsonic.enableDebug"]===!0;if(t.elements["subsonic.onlineSearch"])t.elements["subsonic.onlineSearch"].checked=e["subsonic.onlineSearch"]!==!1;if(t.elements["subsonic.onlineSearchMode"])t.elements["subsonic.onlineSearchMode"].value=e["subsonic.onlineSearchMode"]||"fallback";if(t.elements["subsonic.onlineSearchSources"])t.elements["subsonic.onlineSearchSources"].value=e["subsonic.onlineSearchSources"]||"wy,tx,kw,kg,mg";if(t.elements["subsonic.lyricTranslation"])t.elements["subsonic.lyricTranslation"].checked=e["subsonic.lyricTranslation"]!==!1}catch(e){console.error("Failed to load config:",e)}}togglePublicNonAdminAccessVisibility(){let e=document.querySelector('input[name="user.enablePublicFavorites"]'),t=document.getElementById("public-non-admin-access-wrapper");if(e&&t)t.style.display=e.checked?"block":"none"}togglePublicNonAdminLocalMusicVisibility(){let e=document.querySelector('input[name="user.enablePublicRestriction"]'),t=document.getElementById("public-non-admin-local-music-wrapper");if(e&&t)t.style.display=e.checked?"block":"none"}async saveConfig(e=!1){if(!this.configLoaded)return;let t=document.getElementById("config-form"),s=new FormData(t),n=(s.get("admin.path")||"").trim(),a=(s.get("player.path")||"").trim(),o=document.getElementById("path-conflict-error"),i="";if(!a)i="⚠️ 播放器路径不能为空";else if(!a.startsWith("/"))i="⚠️ 播放器路径必须以 / 开头";else if(n!==""&&!n.startsWith("/"))i="⚠️ 后台路径必须以 / 开头（或留空表示根路径）";else if((n||"/")===(a==="/"?"/":a.replace(/\/+$/,"")))i="⚠️ 后台管理路径与播放器路径不能相同";else if(n.startsWith("/api")||a.startsWith("/api"))i="⚠️ 路径不能以 /api 开头（与 API 路由冲突）";if(o)o.textContent=i,o.style.display=i?"block":"none";if(i)return;let r={serverName:s.get("serverName"),maxSnapshotNum:parseInt(s.get("maxSnapshotNum")),"list.addMusicLocationType":s.get("list.addMusicLocationType"),"proxy.enabled":s.get("proxy.enabled")==="on","proxy.header":s.get("proxy.header"),"proxy.all.enabled":s.get("proxy.all.enabled")==="on","proxy.all.address":s.get("proxy.all.address"),"user.enablePath":s.get("user.enablePath")==="on","user.enableRoot":s.get("user.enableRoot")==="on","user.enablePublicRestriction":s.get("user.enablePublicRestriction")==="on","user.enablePublicNonAdminLocalMusic":s.get("user.enablePublicNonAdminLocalMusic")==="on","user.enablePublicFavorites":s.get("user.enablePublicFavorites")==="on","user.enablePublicNonAdminAccess":s.get("user.enablePublicNonAdminAccess")==="on","user.enableLoginCacheRestriction":s.get("user.enableLoginCacheRestriction")==="on","user.enableCacheSizeLimit":s.get("user.enableCacheSizeLimit")==="on","user.cacheSizeLimit":parseInt(s.get("user.cacheSizeLimit"))||2000,"frontend.password":s.get("frontend.password"),"player.enableAuth":s.get("player.enableAuth")==="on","player.password":s.get("player.password"),"webdav.enable":s.get("webdav.enable")==="on","webdav.url":s.get("webdav.url"),"webdav.username":s.get("webdav.username"),"webdav.password":s.get("webdav.password"),"webdav.syncPath":(s.get("webdav.syncPath")||"").trim()||"/lx-sync","webdav.backupPath":(s.get("webdav.backupPath")||"").trim()||"/lx-sync-backups","sync.interval":parseInt(s.get("sync.interval"))||60,"sync.backupInterval":parseInt(s.get("sync.backupInterval"))||24,"admin.path":n,"player.path":a,"subsonic.enable":s.get("subsonic.enable")==="on","subsonic.path":(s.get("subsonic.path")||"").trim()||"/rest","subsonic.enableDebug":s.get("subsonic.enableDebug")==="on","subsonic.onlineSearch":s.get("subsonic.onlineSearch")==="on","subsonic.onlineSearchMode":s.get("subsonic.onlineSearchMode")||"fallback","subsonic.onlineSearchSources":(s.get("subsonic.onlineSearchSources")||"").trim()||"wy,tx,kw,kg,mg","subsonic.lyricTranslation":s.get("subsonic.lyricTranslation")==="on","singer.sourcePriority":s.get("singer.sourcePriority"),"system.allowUnsafeVM":s.get("system.allowUnsafeVM")==="on"};try{let c=await this.request("/api/config",{method:"POST",body:JSON.stringify(r)});if(r["frontend.password"]&&r["frontend.password"]!==this.password)this.password=r["frontend.password"],localStorage.setItem("lx_auth",r["frontend.password"]);let l=document.getElementById("nav-player-link");if(l)l.href=a===""?"/":a??"/music";if(!e)if(c.warning)showInfo(`配置保存成功！

⚠️ 警告：`+c.warning);else showSuccess("配置保存成功！")}catch(c){if(!e)showError("配置保存失败: "+c.message);throw c}}async loadLogs(){let e=document.getElementById("log-type-select")?.value||"app";try{let t=await this.request(`/api/logs?type=${e}&lines=200`),s=document.getElementById("logs-content");if(t.logs&&t.logs.length)s.innerHTML=t.logs.filter((n)=>n.trim()).map((n)=>`<div class="log-line">${this.escapeHtml(n)}</div>`).join(""),s.scrollTop=s.scrollHeight;else s.innerHTML='<p style="color: var(--text-secondary);">暂无日志</p>'}catch(t){document.getElementById("logs-content").innerHTML='<p style="color: var(--accent-error);">加载日志失败</p>'}}closeModal(){document.getElementById("modal").classList.add("hidden")}async request(e,t={}){let s={headers:{"Content-Type":"application/json","X-Frontend-Auth":this.password}},n=await fetch(""+e,{...s,...t});if(n.status===401)throw this.logout(),Error("Unauthorized");if(!n.ok){let a=await n.text();throw Error(a||"Request failed")}return n.json()}formatUptime(e){if(!e)return"0h";let t=Math.floor(e/3600),s=Math.floor(e%3600/60);if(t>24)return`${Math.floor(t/24)}d ${t%24}h`;return`${t}h ${s}m`}formatMemory(e){return(e/1024/1024).toFixed(1)+" MB"}escapeHtml(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}async testWebDAV(){try{let e=await this.request("/api/webdav/test",{method:"POST"});if(e.success)showSuccess(`✅ WebDAV连接成功！
`+e.message);else showError(`❌ WebDAV连接失败
`+e.message)}catch(e){showError("❌ 连接失败: "+e.message)}}async testProxy(){let e=document.querySelector('input[name="proxy.all.address"]').value;if(!e){showInfo("请输入代理地址");return}showInfo("正在测试代理，请稍候...");try{let t=await this.request("/api/config/test-proxy",{method:"POST",body:JSON.stringify({address:e})});if(t.success)showSuccess("✅ "+t.message);else showError("❌ "+t.message)}catch(t){showError("❌ 测试失败: "+t.message)}}async backupToWebDAV(){if(!await showSelect("WebDAV 备份","确定要创建全量备份并上传到 WebDAV 吗？"))return;let e=document.getElementById("sync-status-content");e.innerHTML='<p style="color: var(--accent-warning);">正在备份...</p>',this.showProgress(!0);try{if((await this.request("/api/webdav/backup",{method:"POST",body:JSON.stringify({force:!0})})).success)e.innerHTML='<p style="color: var(--accent-success);">✅ 备份成功！</p>',this.loadSyncLogs();else e.innerHTML='<p style="color: var(--accent-error);">❌ 备份失败</p>'}catch(t){e.innerHTML='<p style="color: var(--accent-error);">❌ 备份失败: '+t.message+"</p>"}finally{setTimeout(()=>this.showProgress(!1),3000)}}async restoreFromWebDAV(){if(!await showSelect("WebDAV 恢复",`⚠️ 警告：从云端恢复将覆盖本地所有数据！

确定要继续吗？`,{danger:!0}))return;let e=document.getElementById("sync-status-content");e.innerHTML='<p style="color: var(--accent-warning);">正在从云端恢复数据...</p>';try{if((await this.request("/api/webdav/restore",{method:"POST"})).success)e.innerHTML='<p style="color: var(--accent-success);">✅ 恢复成功！页面将刷新...</p>',setTimeout(()=>location.reload(),2000);else e.innerHTML='<p style="color: var(--accent-error);">❌ 恢复失败</p>'}catch(t){e.innerHTML='<p style="color: var(--accent-error);">❌ 恢复失败: '+t.message+"</p>"}}async syncFilesToWebDAV(){if(!await showSelect("同步文件","确定要强制同步所有文件到 WebDAV 吗？"))return;let e=document.getElementById("sync-status-content");e.innerHTML='<p style="color: var(--accent-warning);">正在同步文件...</p>',this.showProgress(!0);try{if((await this.request("/api/webdav/sync",{method:"POST"})).success)e.innerHTML='<p style="color: var(--accent-success);">✅ 同步成功！</p>',this.loadSyncLogs();else e.innerHTML='<p style="color: var(--accent-error);">❌ 同步失败</p>'}catch(t){e.innerHTML='<p style="color: var(--accent-error);">❌ 同步失败: '+t.message+"</p>"}finally{setTimeout(()=>this.showProgress(!1),3000)}}showProgress(e){let t=document.getElementById("sync-progress-container");if(e)t.classList.remove("hidden"),this.updateProgress(0,"准备中...");else t.classList.add("hidden")}updateProgress(e,t){let s=document.getElementById("progress-bar"),n=document.getElementById("progress-text"),a=document.getElementById("progress-percent");if(s)s.style.width=`${e}%`;if(n)n.textContent=t;if(a)a.textContent=`${Math.round(e)}%`}renderSongTags(e){let t='<div class="song-meta-tags">';if(e.source)t+=`<span class="tag tag-source ${e.source}">${this.escapeHtml(e.source)}</span>`;let s=e.meta?e.meta._qualitys||e.meta.qualitys:null;if(s){if(Array.isArray(s)){if(s.some((n)=>n.type==="flac24bit"))t+='<span class="tag tag-quality hr">Hi-Res</span>';else if(s.some((n)=>n.type==="flac"))t+='<span class="tag tag-quality lossless">SQ</span>';else if(s.some((n)=>n.type==="320k"))t+='<span class="tag tag-quality high">HQ</span>'}else if(s.flac24bit)t+='<span class="tag tag-quality hr">Hi-Res</span>';else if(s.flac)t+='<span class="tag tag-quality lossless">SQ</span>';else if(s["320k"])t+='<span class="tag tag-quality high">HQ</span>'}if(e.interval)t+=`<span class="tag tag-interval">${this.escapeHtml(e.interval)}</span>`;return t+="</div>",t}renderSongNameCell(e){let t=e.meta?.picUrl||"",s=t?`<img src="${t}" class="song-cover" loading="lazy" alt="cover" onerror="this.style.opacity=0">`:'<div class="song-cover" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;">\uD83C\uDFB5</div>',n=e.singer?`<span class="song-singer-mobile">${this.escapeHtml(e.singer)}</span>`:"";return`
            <div class="song-col-name">
                ${s}
                <div class="song-info-wrapper min-w-0">
                    <span class="song-title-text dynamic-marquee truncate" title="${this.escapeHtml(e.name)}">${this.escapeHtml(e.name||"未知歌曲")}</span>
                    ${n}
                    ${this.renderSongTags(e)}
                </div>
            </div>
        `}initSSE(){if(this.sseSource)return;let e=this.password||localStorage.getItem("lx_auth");if(!e)return;this.sseSource=new EventSource(`/api/webdav/progress?auth=${encodeURIComponent(e)}`),this.sseSource.onmessage=(t)=>{try{let s=JSON.parse(t.data);if(s.type==="backup"){if(s.status==="uploading"){let n=s.current/s.total*100;this.updateProgress(n,`正在上传备份: ${this.formatFileSize(s.current)} / ${this.formatFileSize(s.total)}`)}else if(s.status==="packing")this.updateProgress(5,s.message||"正在打包文件...");else if(s.status==="preparing")this.updateProgress(0,s.message);else if(s.status==="success")this.updateProgress(100,"备份上传完成")}else if(s.type==="sync"){if(s.status==="processing"){let n=s.current/s.total*100;this.updateProgress(n,`正在同步文件 (${s.current}/${s.total}): ${s.file}`)}else if(s.status==="finish")this.updateProgress(100,"文件同步完成")}else if(s.type==="restore"){if(s.status==="processing"){let n=s.current/s.total*100;this.updateProgress(n,`正在恢复文件 (${s.current}/${s.total}): ${s.file}`)}else if(s.status==="downloading")this.updateProgress(30,s.message||"正在下载备份...");else if(s.status==="extracting")this.updateProgress(70,s.message||"正在解压备份...");else if(s.status==="start")this.updateProgress(0,s.message||"正在从云端恢复数据...");else if(s.status==="finish")this.updateProgress(100,s.message||"数据恢复完成");else if(s.status==="error")this.updateProgress(0,s.message||"恢复失败")}else if(s.type==="file"){if(s.status==="uploading");}}catch(s){console.error("SSE Parse Error:",s)}},this.sseSource.onerror=(t)=>{}}async loadSyncLogs(){try{let e=await this.request("/api/webdav/logs"),t=document.getElementById("sync-logs-content");if(!e.logs||e.logs.length===0){t.innerHTML='<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">暂无同步日志</p>';return}t.innerHTML=e.logs.map((s)=>`
            <div class="sync-log-item">
                <div class="log-info">
                    <span class="log-type log-type-${s.type}">${this.getLogTypeText(s.type)}</span>
                    <span class="log-file">${s.file}</span>
                    ${s.message?`<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${s.message}</div>`:""}
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span class="log-status log-status-${s.status}">${s.status==="success"?"成功":"失败"}</span>
                    <span class="log-time">${this.formatTime(s.timestamp)}</span>
                </div>
            </div>
        `).join("")}catch(e){console.error("Failed to load sync logs:",e)}}getLogTypeText(e){return{upload:"上传",download:"下载",backup:"备份",restore:"恢复"}[e]||e}formatTime(e){let s=Date.now()-e,n=60000,a=3600000,o=86400000;if(s<60000)return"刚刚";if(s<3600000)return Math.floor(s/60000)+"分钟前";if(s<86400000)return Math.floor(s/3600000)+"小时前";return new Date(e).toLocaleString("zh-CN")}currentPath="";async loadFiles(e=""){this.currentPath=e;try{let t=await this.request(`/api/files?path=${encodeURIComponent(e)}`);this.renderFileList(t.items||[]),this.updateBreadcrumb(e)}catch(t){console.error("Failed to load files:",t),document.getElementById("file-items").innerHTML='<p style="padding: 2rem; text-align: center; color: var(--accent-error);">加载文件失败</p>'}}renderFileList(e){let t=document.getElementById("file-items");if(e.length===0){t.innerHTML='<p style="padding: 2rem; text-align: center; color: var(--text-secondary);">此文件夹为空</p>';return}e.sort((s,n)=>{if(s.isDirectory&&!n.isDirectory)return-1;if(!s.isDirectory&&n.isDirectory)return 1;return s.name.localeCompare(n.name)}),t.innerHTML=e.map((s)=>`
        <div class="file-item">
            <div class="file-name" onclick="app.${s.isDirectory?`loadFiles('${s.path}')`:`viewFile('${s.path}')`}">
                <span class="file-icon">${s.isDirectory?"\uD83D\uDCC1":this.getFileIcon(s.name)}</span>
                <span>${s.name}</span>
            </div>
            <div class="file-size">${s.isDirectory?"-":this.formatFileSize(s.size)}</div>
            <div class="file-date">${this.formatDate(s.mtime)}</div>
            <div class="file-item-actions">
                ${!s.isDirectory?`<button onclick="app.editFile('${s.path}')">编辑</button>`:""}
                <button onclick="app.downloadFile('${s.path}')">下载</button>
                <button onclick="app.deleteFile('${s.path}', ${s.isDirectory})" style="color: var(--accent-error);">删除</button>
            </div>
        </div>
    `).join("")}getFileIcon(e){let t=e.split(".").pop().toLowerCase();return{json:"\uD83D\uDCC4",txt:"\uD83D\uDCDD",log:"\uD83D\uDCCB",js:"\uD83D\uDCDC",css:"\uD83C\uDFA8",html:"\uD83C\uDF10",md:"\uD83D\uDCD6"}[t]||"\uD83D\uDCC4"}updateBreadcrumb(e){let t=e?e.split("/").filter((o)=>o):[],s=document.getElementById("file-breadcrumb"),n=`<a href="#" onclick="app.loadFiles(''); return false;">根目录</a>`,a="";t.forEach((o,i)=>{a+=(i>0?"/":"")+o,n+=`<a href="#" onclick="app.loadFiles('${a}'); return false;">${o}</a>`}),s.innerHTML=n}async createNewFile(){let e=await showInput("创建文件","请输入文件名：");if(!e)return;let t=this.currentPath?`${this.currentPath}/${e}`:e;try{await this.request("/api/files",{method:"POST",body:JSON.stringify({path:t,content:"",isDirectory:!1})}),this.loadFiles(this.currentPath),showSuccess("文件创建成功")}catch(s){showError("创建文件失败: "+s.message)}}async createNewFolder(){let e=await showInput("创建文件夹","请输入文件夹名：");if(!e)return;let t=this.currentPath?`${this.currentPath}/${e}`:e;try{await this.request("/api/files",{method:"POST",body:JSON.stringify({path:t,isDirectory:!0})}),this.loadFiles(this.currentPath),showSuccess("文件夹创建成功")}catch(s){showError("创建文件夹失败: "+s.message)}}async editFile(e){let t=await showInput("编辑文件",`编辑文件内容（简易编辑器）：

提示：输入新内容后点击确定`,{defaultValue:""});if(t===null)return;try{await this.request("/api/files",{method:"PUT",body:JSON.stringify({path:e,content:t})}),showSuccess("保存成功！")}catch(s){showError("保存失败: "+s.message)}}viewFile(e){showInfo("文件查看功能："+e+`

可以通过下载按钮下载文件后查看`)}async downloadFile(e){let t=`/api/files/download?path=${encodeURIComponent(e)}`,s=document.createElement("a");s.href=t,s.download=e.split("/").pop(),s.click()}async deleteFile(e,t){let s=t?"文件夹":"文件";if(!await showSelect("删除文件",`确定要删除${s} "${e}" 吗？

${t?"⚠️ 文件夹内的所有内容也会被删除！":""}`,{danger:!0}))return;try{await this.request("/api/files",{method:"DELETE",body:JSON.stringify({path:e})}),this.loadFiles(this.currentPath),showSuccess("删除成功")}catch(n){showError("删除失败: "+n.message)}}formatFileSize(e){if(e<1024)return e+" B";if(e<1048576)return(e/1024).toFixed(1)+" KB";return(e/1024/1024).toFixed(1)+" MB"}formatDate(e){return new Date(e).toLocaleString("zh-CN")}formatUptime(e){let t=Math.floor(e/86400),s=Math.floor(e%86400/3600),n=Math.floor(e%3600/60),a=[];if(t>0)a.push(`${t}d`);if(s>0)a.push(`${s}h`);if(n>0)a.push(`${n}m`);if(a.length===0)a.push("0m");return a.join(" ")}bindWebDAVEvents(){document.getElementById("test-webdav-btn")?.addEventListener("click",()=>this.testWebDAV()),document.getElementById("backup-webdav-btn")?.addEventListener("click",()=>this.backupToWebDAV()),document.getElementById("restore-webdav-btn")?.addEventListener("click",()=>this.restoreFromWebDAV()),document.getElementById("sync-files-btn")?.addEventListener("click",()=>this.syncFilesToWebDAV()),document.getElementById("refresh-sync-logs-btn")?.addEventListener("click",()=>this.loadSyncLogs()),document.getElementById("test-proxy-btn")?.addEventListener("click",()=>this.testProxy()),document.getElementById("backup-local-btn")?.addEventListener("click",()=>this.downloadLocalBackup()),document.getElementById("restore-local-btn")?.addEventListener("click",()=>document.getElementById("local-backup-input").click()),document.getElementById("local-backup-input")?.addEventListener("change",(e)=>this.handleLocalRestore(e)),this.initSSE()}bindFileManagerEvents(){document.getElementById("new-file-btn")?.addEventListener("click",()=>this.createNewFile()),document.getElementById("new-folder-btn")?.addEventListener("click",()=>this.createNewFolder()),document.getElementById("refresh-files-btn")?.addEventListener("click",()=>this.loadFiles(this.currentPath))}async loadSnapshots(){let e=document.getElementById("snapshot-user-select")?.value,t=document.getElementById("snapshots-list");if(!e){this.renderUserSelectionGrid("snapshot");return}t.classList.add("content-loading");try{let s=await this.request(`/api/data/snapshots?user=${encodeURIComponent(e)}`);if(!s.length){t.innerHTML='<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">暂无快照</div>',t.classList.remove("content-loading");return}t.innerHTML=s.map((n)=>`
            <div class="snapshot-row">
                <div class="col-time">${new Date(n.time).toLocaleString()}</div>
                <div class="col-id" title="${n.id}">snapshot_${n.id}</div>
                <div class="col-size">${this.formatFileSize(n.size)}</div>
                <div class="col-actions snapshot-actions">
                    <button class="btn-download" onclick="app.downloadSnapshot('${n.id}')">
                        <!-- 下载图标 -->
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        下载备份
                    </button>
                    <button class="btn-restore" onclick="app.restoreSnapshot('${n.id}')">
                        <!-- 恢复图标 -->
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1 4 1 10 7 10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        回滚
                    </button>
                    <!-- [新增] 删除按钮 -->
                    <button class="btn-delete" onclick="app.deleteSnapshot('${n.id}')">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        删除
                    </button>
                </div>
            </div>
        `).join(""),t.classList.remove("content-loading"),t.classList.add("fade-in"),setTimeout(()=>{t.classList.remove("fade-in")},400)}catch(s){console.error(s),showError("加载快照列表失败: "+s.message),t.classList.remove("content-loading")}}triggerUploadSnapshot(){if(!document.getElementById("snapshot-user-select")?.value){showInfo("请先选择用户");return}document.getElementById("snapshot-upload-input").click()}async handleSnapshotUpload(e){let t=e.target.files[0];if(!t)return;let s=document.getElementById("snapshot-user-select")?.value;if(!s)return;e.target.value="";try{let n=await t.text(),{lastModified:a,name:o}=t,i=await fetch(`/api/data/upload-snapshot?user=${encodeURIComponent(s)}&time=${a}&filename=${encodeURIComponent(o)}`,{method:"POST",headers:{"X-Frontend-Auth":this.password},body:n});if(!i.ok){let r=await i.text();throw Error(r||"Upload failed")}showSuccess("上传成功"),this.loadSnapshots()}catch(n){console.error(n),showError("上传失败: "+n.message)}}async deleteSnapshot(e){if(!await showSelect("删除快照","确定要删除这个快照吗？",{danger:!0}))return;let t=document.getElementById("snapshot-user-select")?.value;if(!t)return;try{let s=await fetch(`/api/data/delete-snapshot?user=${encodeURIComponent(t)}`,{method:"POST",headers:{"Content-Type":"application/json","X-Frontend-Auth":this.password},body:JSON.stringify({id:e})});if(!s.ok){let n=await s.text();throw Error(n||"Delete failed")}this.loadSnapshots(),showSuccess("删除成功")}catch(s){console.error(s),showError("删除失败: "+s.message)}}async downloadSnapshot(e){let t=document.getElementById("snapshot-user-select")?.value;if(!t){showInfo("请先选择用户");return}try{let s=await this.request(`/api/data/snapshot?id=${e}&user=${encodeURIComponent(t)}`),n={id:"default",name:"list__name_default"},a={id:"love",name:"list__name_love"},o={type:"playList_v2",data:[{...n,list:s.defaultList||[]},{...a,list:s.loveList||[]},...s.userList||[]]},i=new Blob([JSON.stringify(o,null,2)],{type:"application/json"}),r=URL.createObjectURL(i),c=document.createElement("a");c.href=r,c.download=`lx_backup_${t}_${e.substring(0,8)}.json`,c.click(),URL.revokeObjectURL(r)}catch(s){console.error(s),showError("导出快照失败: "+s.message)}}async downloadLocalBackup(){if(!await showSelect("本地备份",`确定要创建并下载本地全量 ZIP 备份吗？

这可能需要一些时间，取决于数据量。`))return;try{let e=`/api/backup/download?auth=${encodeURIComponent(this.password)}`,t=document.createElement("a");t.href=e;let s=new Date().toISOString().split("T")[0];t.download=`lx-sync-backup-local-${s}.zip`,t.click()}catch(e){showError("下载本地备份失败: "+e.message)}}async handleLocalRestore(e){let t=e.target.files[0];if(!t)return;if(!await showSelect("还原数据",`确定要从上传的 ZIP 文件还原数据吗？

⚠️ 警告：这将覆盖当前的服务器所有数据！
强烈建议在还原前先手动下载一个本地备份。操作不可撤销。`,{danger:!0})){e.target.value="";return}let s=new FormData;s.append("backup",t);let n=document.createElement("div");n.className="overlay",n.style.background="rgba(0,0,0,0.8)",n.innerHTML=`
            <div class="login-box glass" style="padding: 3rem;">
                <div class="status-dot" style="margin: 0 auto 1.5rem; width: 12px; height: 12px;"></div>
                <h2>正在还原数据...</h2>
                <p style="color: var(--text-secondary); margin-top: 1rem;">正在解压并恢复文件，请勿关闭或刷新页面。</p>
            </div>
        `,document.body.appendChild(n);try{let a=await fetch("/api/backup/upload",{method:"POST",headers:{"X-Frontend-Auth":this.password},body:s});if(!a.ok){let i=await a.text();throw Error(i||"Restore failed")}let o=await a.json();showSuccess("\uD83C\uDF89 还原成功！数据已更新，页面将立即刷新以加载最新配置。"),setTimeout(()=>window.location.reload(),1500)}catch(a){console.error(a),showError("本地还原失败: "+a.message),n.remove()}finally{e.target.value=""}}async restoreSnapshot(e){let t=document.getElementById("snapshot-user-select")?.value;if(!t){showInfo("请先选择用户");return}if(!await showSelect("回滚快照",`警告：此操作将把服务器数据回滚到选定的快照状态！

1. 当前所有未保存的更改将丢失。
2. 所有客户端的同步状态将被重置。
3. 客户端连接后，请务必选择【远程覆盖本地】以获取回滚后的数据。

确定要继续吗？`,{danger:!0}))return;try{await this.request(`/api/data/restore-snapshot?user=${encodeURIComponent(t)}`,{method:"POST",body:JSON.stringify({id:e})}),showSuccess("回滚成功！请重启客户端或重新连接同步服务。"),this.loadDashboard()}catch(s){showError("回滚失败: "+s.message)}}async restartServer(){if(!await showSelect("重启服务器",`确定要重启服务器吗？

重启后所有连接的客户端将断开，大约需要几秒钟时间。`,{danger:!0}))return;try{let e=await this.request("/api/restart",{method:"POST"});if(e.success)showSuccess(`服务器正在重启，请稍候...

页面将在 5 秒后自动刷新。`),setTimeout(()=>{window.location.reload()},5000);else showError("重启失败: "+(e.message||"未知错误"))}catch(e){showError("重启请求失败: "+e.message)}}checkWebDAVConfig(e){let t=document.getElementById("webdav-cloud-group"),s=document.getElementById("webdav-config-guide"),n=document.getElementById("webdav-status-section"),a=document.getElementById("webdav-logs-section");if(e)t?.classList.remove("hidden"),s?.classList.add("hidden"),n?.classList.remove("hidden"),a?.classList.remove("hidden");else t?.classList.add("hidden"),s?.classList.remove("hidden"),n?.classList.add("hidden"),a?.classList.add("hidden")}jumpToWebDAVConfig(){this.switchView("config").then(()=>{setTimeout(()=>{let e=document.getElementById("config-card-webdav");if(e)e.scrollIntoView({behavior:"smooth",block:"center"}),e.style.outline="2px solid var(--accent-primary)",e.style.outlineOffset="4px",setTimeout(()=>{e.style.outline="none"},2000)},300)})}}document.addEventListener("click",(e)=>{if(!e.target.closest(".custom-user-selector"))document.querySelectorAll(".selector-dropdown").forEach((t)=>t.classList.add("hidden")),document.querySelectorAll(".custom-user-selector").forEach((t)=>t.classList.remove("open"))});var L=new w;
