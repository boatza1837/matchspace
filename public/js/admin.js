/**
 * MatchSpace Admin & Owner Management Controller
 * Handles Admin Dashboard, Reports, Activities moderation, System Stats, Login Logs,
 * and User Management with Owner AES-256-GCM password reveal.
 */

function initAdminModule() {
  const reportsTableBody = document.getElementById('reportsTableBody');
  const userTableBody = document.getElementById('userTableBody');
  const activityTableBody = document.getElementById('activityTableBody');
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');

  // ===================== ADMIN DASHBOARD (admin.html) =====================
  if (reportsTableBody && userTableBody) {
    async function loadAdminDashboard() {
      try {
        const [summary, sessionState, users, activities, reports] = await Promise.all([
          apiRequest('/api/admin/summary').catch(() => ({})),
          apiRequest('/api/session').catch(() => ({ user: null })),
          apiRequest('/api/admin/users').catch(() => []),
          apiRequest('/api/admin/activities').catch(() => []),
          apiRequest('/api/reports').catch(() => [])
        ]);

        document.getElementById('totalUsers').textContent = summary.total_users || 0;
        document.getElementById('totalReports').textContent = summary.total_reports || 0;
        document.getElementById('pendingReports').textContent = summary.pending_reports || 0;
        document.getElementById('resolvedReports').textContent = summary.resolved_reports || 0;

        const isOwner = sessionState.user && sessionState.user.role === 'owner';
        const thUserPassOwner = document.getElementById('thUserPassOwner');
        if (thUserPassOwner) {
          thUserPassOwner.style.display = isOwner ? '' : 'none';
        }

        userTableBody.innerHTML = users.map((user) => {
          const userRole = user.role || (user.is_admin ? 'admin' : 'user');
          const isBanned = user.is_active === 0;

          const roleSelectHtml = isOwner ? `
            <div style="display:flex; gap:6px; align-items:center;">
              <select data-role-select-id="${user.id}" style="padding:4px 8px; border-radius:6px; border:1px solid #ccc; font-size:0.82rem;">
                <option value="user" ${userRole === 'user' ? 'selected' : ''}>User (ทั่วไป)</option>
                <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin (ตรวจรายงาน)</option>
                <option value="owner" ${userRole === 'owner' ? 'selected' : ''}>Owner (ผู้ดูแลสูงสุด)</option>
              </select>
              <button class="inline-button review" data-action-save-role="${user.id}" style="padding:4px 10px; font-size:0.78rem;">บันทึก</button>
            </div>
          ` : `<span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span>`;

          const resetPasswordTd = isOwner ? `
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <span id="passText-${user.id}" style="font-family:monospace; font-weight:bold; color:var(--purple); background:#f0edff; padding:3px 8px; border-radius:6px; font-size:0.85rem;">••••••••</span>
                <button type="button" class="inline-button review" data-action-toggle-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:4px 8px; font-size:0.78rem;" title="ดู/ซ่อนรหัสผ่าน">👁️ ดูรหัส</button>
                <button type="button" class="inline-button review" data-action-reset-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:4px 8px; font-size:0.78rem;" title="เปลี่ยนรหัสผ่าน">🔑 เปลี่ยน</button>
              </div>
            </td>
          ` : '';

          return `
            <tr>
              <td>${user.id}</td>
              <td>
                <strong>${escapeHtml(user.name)}</strong>
                ${user.nickname && user.nickname !== user.name ? `<span class="skipped-card-nickname" style="font-size:0.76rem; margin-left:6px; vertical-align:middle;">${escapeHtml(user.nickname)}</span>` : ''}
              </td>
              <td>${user.email}</td>
              <td>${user.major || '-'}</td>
              <td><span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span></td>
              <td>${roleSelectHtml}</td>
              ${resetPasswordTd}
              <td>
                <button class="inline-button ${isBanned ? 'resolve' : 'reject'}" data-user-id="${user.id}" data-action="${isBanned ? 'enable' : 'disable'}" style="padding:4px 10px; font-size:0.78rem;">
                  ${isBanned ? '✅ ปลดแบน' : '🚫 แบนผู้ใช้'}
                </button>
              </td>
            </tr>
          `;
        }).join('');

        if (isOwner) {
          document.querySelectorAll('[data-action-toggle-pass]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const userId = btn.dataset.actionTogglePass;
              const passEl = document.getElementById(`passText-${userId}`);
              if (!passEl) return;

              if (passEl.dataset.revealed === 'true') {
                passEl.textContent = '••••••••';
                passEl.dataset.revealed = 'false';
                btn.textContent = '👁️ ดูรหัส';
                return;
              }

              if (passEl.dataset.plain) {
                passEl.textContent = passEl.dataset.plain;
                passEl.dataset.revealed = 'true';
                btn.textContent = '🔒 ซ่อน';
                return;
              }

              const origText = btn.textContent;
              btn.disabled = true;
              btn.textContent = '⏳';
              try {
                const res = await apiRequest(`/api/admin/users/${userId}/reveal-password`, { method: 'POST' });
                const pass = res.password || '(สมัครผ่าน Google หรือไม่มีรหัส)';
                passEl.dataset.plain = pass;
                passEl.textContent = pass;
                passEl.dataset.revealed = 'true';
                btn.textContent = '🔒 ซ่อน';
              } catch (err) {
                alert('ไม่สามารถถอดรหัสผ่านได้: ' + err.message);
                btn.textContent = origText;
              } finally {
                btn.disabled = false;
              }
            });
          });
        }

        document.querySelectorAll('[data-action-save-role]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionSaveRole;
            const selectEl = document.querySelector(`[data-role-select-id="${userId}"]`);
            const newRole = selectEl ? selectEl.value : 'user';
            try {
              const res = await apiRequest(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole })
              });
              alert(res.message);
              loadAdminDashboard();
            } catch (e) {
              alert('เกิดข้อผิดพลาด: ' + e.message);
            }
          });
        });

        document.querySelectorAll('[data-action-reset-pass]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionResetPass;
            const userEmail = btn.dataset.userEmail;
            const newPassword = prompt(`กรอกรหัสผ่านใหม่สำหรับ ${userEmail}:`);
            if (newPassword && newPassword.trim()) {
              try {
                const res = await apiRequest(`/api/admin/users/${userId}/password`, {
                  method: 'PUT',
                  body: JSON.stringify({ new_password: newPassword.trim() })
                });
                alert(res.message);
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });

        document.querySelectorAll('[data-action]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            const action = btn.dataset.action;
            try {
              const result = await apiRequest(`/api/users/${userId}/${action}`, { method: 'PATCH' });
              alert(result.message);
              loadAdminDashboard();
            } catch (error) {
              alert('Error: ' + error.message);
            }
          });
        });

        if (activityTableBody) {
          activityTableBody.innerHTML = activities.map((activity) => `
            <tr>
              <td>${activity.id}</td>
              <td>${activity.name}</td>
              <td>${activity.location || '-'}</td>
              <td>${activity.event_date ? (formatActivityDate(activity.event_date) + (activity.event_time ? ' ' + activity.event_time + ' น.' : '')) : '-'}</td>
              <td>${activity.creator_name || '-'}</td>
              <td>${activity.creator_major || '-'}</td>
              <td>${activity.actual_members || activity.member_count || 0}</td>
              <td><span class="badge ${activity.status}">${activity.status}</span></td>
              <td>
                <div class="actions">
                  <button class="inline-button resolve" data-activity-id="${activity.id}" data-activity-action="approved">Approve</button>
                  <button class="inline-button reject" data-activity-id="${activity.id}" data-activity-action="rejected">Reject (ยุบกลุ่ม)</button>
                  <button class="inline-button reject" data-activity-delete-id="${activity.id}" style="background:#d32f2f;">Delete</button>
                </div>
              </td>
            </tr>
          `).join('');

          document.querySelectorAll('[data-activity-action]').forEach((button) => {
            button.addEventListener('click', async () => {
              const id = button.dataset.activityId;
              const status = button.dataset.activityAction;
              const label = status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธและยุบกลุ่ม';
              try {
                button.disabled = true;
                button.textContent = '⏳ กำลังดำเนินการ...';
                const res = await apiRequest(`/api/admin/activities/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status })
                });
                alert(`✅ ${res.message || label + 'สำเร็จ!'}`);
                loadAdminDashboard();
              } catch (err) {
                button.disabled = false;
                button.textContent = status === 'approved' ? 'Approve' : 'Reject (ยุบกลุ่ม)';
                alert('เกิดข้อผิดพลาด: ' + err.message);
              }
            });
          });

          document.querySelectorAll('[data-activity-delete-id]').forEach((button) => {
            button.addEventListener('click', async () => {
              const id = button.dataset.activityDeleteId;
              if (confirm('คุณต้องการลบกิจกรรมนี้ออกจากระบบและยุบแชทกลุ่มใช่หรือไม่?')) {
                try {
                  button.disabled = true;
                  button.textContent = '⏳ กำลังลบ...';
                  const res = await apiRequest(`/api/admin/activities/${id}`, { method: 'DELETE' });
                  alert(`✅ ${res.message || 'ลบกิจกรรมและยุบแชทกลุ่มสำเร็จ'}`);
                  loadAdminDashboard();
                } catch (err) {
                  button.disabled = false;
                  button.textContent = 'Delete';
                  alert('เกิดข้อผิดพลาด: ' + err.message);
                }
              }
            });
          });
        }

        reportsTableBody.innerHTML = reports.map((report) => {
          const evidenceHtml = report.evidence_file
            ? `<a href="${report.evidence_file}" target="_blank" title="คลิกเปิดรูปขนาดเต็ม">
                 <img src="${report.evidence_file}" style="width:55px; height:55px; object-fit:cover; border-radius:8px; border:1px solid #ccc; cursor:pointer;" alt="หลักฐาน" />
               </a>`
            : '<span style="color:#aaa; font-size:0.85rem;">ไม่มี</span>';

          const targetName = report.target_user_name || report.reported_user;
          const isBanned = report.target_user_active === 0;
          const targetUserId = report.target_user_id;

          let reportedUserHtml = `<div><strong>${targetName}</strong></div>`;
          if (report.target_user_email) {
            reportedUserHtml += `<small style="color:#777;">${report.target_user_email}</small>`;
          }
          if (isBanned) {
            reportedUserHtml += `<div><span class="badge rejected" style="font-size:0.75rem; margin-top:2px;">ถูกแบนแล้ว</span></div>`;
          }

          let actionButtonsHtml = `
            <div class="actions">
              <button class="inline-button review" data-status-btn-id="${report.id}" data-status="reviewed">Review</button>
              <button class="inline-button resolve" data-status-btn-id="${report.id}" data-status="resolved">Resolve</button>
              <button class="inline-button reject" data-status-btn-id="${report.id}" data-status="rejected">Reject</button>
            </div>
            <div class="actions" style="margin-top:6px; gap:4px;">
              ${targetUserId && !report.target_user_is_admin ? (
                isBanned
                  ? `<button class="inline-button resolve" data-action-unban-user="${targetUserId}" data-report-id="${report.id}">✅ ยกเลิกแบน</button>`
                  : `<button class="inline-button reject" data-action-ban-user="${targetUserId}" data-report-id="${report.id}">🚫 แบนผู้ใช้</button>`
              ) : ''}
              <button class="inline-button review" data-action-warn-user="${report.id}" data-target-name="${targetName}" data-target-user-id="${targetUserId || ''}">⚠️ ส่งเตือน</button>
            </div>
          `;

          return `
            <tr>
              <td>${report.id}</td>
              <td>${report.reporter_name}<br><small>${report.reporter_email}</small></td>
              <td>${reportedUserHtml}</td>
              <td>${report.report_type}</td>
              <td>${report.description}</td>
              <td>${evidenceHtml}</td>
              <td><span class="badge ${report.status}">${report.status}</span></td>
              <td>
                ${actionButtonsHtml}
                <div style="margin-top:8px;">
                  <textarea data-note-id="${report.id}" rows="2" placeholder="Note for reviewer">${report.admin_note || ''}</textarea>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        document.querySelectorAll('[data-status-btn-id]').forEach((button) => {
          button.addEventListener('click', async () => {
            const id = button.dataset.statusBtnId;
            const status = button.dataset.status;
            const note = document.querySelector(`[data-note-id="${id}"]`)?.value || '';
            await apiRequest(`/api/admin/reports/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status, admin_note: note })
            });
            loadAdminDashboard();
          });
        });

        document.querySelectorAll('[data-action-ban-user]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionBanUser;
            const reportId = btn.dataset.reportId;
            if (confirm('คุณต้องการแบนผู้ใช้งานคนนี้ใช่หรือไม่?')) {
              try {
                await apiRequest(`/api/users/${userId}/disable`, { method: 'PATCH' });
                await apiRequest(`/api/admin/reports/${reportId}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'resolved', admin_note: 'แบนผู้ใช้งานเรียบร้อยแล้ว' })
                });
                alert('แบนผู้ใช้งานสำเร็จ');
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });

        document.querySelectorAll('[data-action-unban-user]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.actionUnbanUser;
            if (confirm('คุณต้องการปลดแบนผู้ใช้งานคนนี้ใช่หรือไม่?')) {
              try {
                await apiRequest(`/api/users/${userId}/enable`, { method: 'PATCH' });
                alert('ปลดแบนผู้ใช้งานสำเร็จ');
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              }
            }
          });
        });

        document.querySelectorAll('[data-action-warn-user]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const reportId = btn.dataset.actionWarnUser;
            const targetName = btn.dataset.targetName;
            const targetUserId = btn.dataset.targetUserId;
            const msg = prompt(`ระบุข้อความตักเตือนที่จะส่งถึง ${targetName}:`, 'กรุณาปฏิบัติตามกฎกติกามารยาทของการใช้งาน MatchSpace');
            if (msg && msg.trim()) {
              try {
                btn.disabled = true;
                const res = await apiRequest(`/api/admin/reports/${reportId}/warn`, {
                  method: 'POST',
                  body: JSON.stringify({ warning_message: msg, target_user_id: targetUserId ? Number(targetUserId) : null })
                });
                alert('✅ ' + res.message);
                loadAdminDashboard();
              } catch (e) {
                alert('เกิดข้อผิดพลาด: ' + e.message);
              } finally {
                btn.disabled = false;
              }
            }
          });
        });

        await loadSystemStats();
        await loadLoginLogs();

        const refreshStatsBtn = document.getElementById('refreshSystemStatsBtn');
        if (refreshStatsBtn && !refreshStatsBtn.dataset.bound) {
          refreshStatsBtn.dataset.bound = 'true';
          refreshStatsBtn.addEventListener('click', () => {
            loadSystemStats();
          });
        }

        const searchInput = document.getElementById('loginLogsSearchInput');
        if (searchInput && !searchInput.dataset.bound) {
          searchInput.dataset.bound = 'true';
          let timeout = null;
          searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
              loadLoginLogs(searchInput.value);
            }, 300);
          });
        }

        const refreshLogsBtn = document.getElementById('refreshLoginLogsBtn');
        if (refreshLogsBtn && !refreshLogsBtn.dataset.bound) {
          refreshLogsBtn.dataset.bound = 'true';
          refreshLogsBtn.addEventListener('click', () => {
            const q = searchInput ? searchInput.value : '';
            loadLoginLogs(q);
          });
        }
      } catch (error) {
        if (reportsTableBody) {
          reportsTableBody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
        }
      }
    }

    async function loadLoginLogs(searchQuery = '') {
      const tableBody = document.getElementById('loginLogsTableBody');
      if (!tableBody) return;

      try {
        const url = searchQuery ? `/api/admin/login-logs?q=${encodeURIComponent(searchQuery)}` : '/api/admin/login-logs';
        const logs = await apiRequest(url);

        tableBody.innerHTML = logs.length
          ? logs.map(log => {
              const isSuccess = log.status === 'success';
              const statusHtml = isSuccess
                ? '<span class="status-badge-success">✅ สำเร็จ</span>'
                : `<span class="status-badge-failed">❌ ${log.status || 'ล้มเหลว'}</span>`;

              return `
                <tr>
                  <td style="color:var(--muted); font-size:0.84rem;">${log.created_at || '-'}</td>
                  <td><strong>${log.email}</strong></td>
                  <td><span class="ip-pill">${log.ip || '127.0.0.1'}</span></td>
                  <td>${log.device || '💻 Google Chrome (Windows 10/11)'}</td>
                  <td><span class="action-text">${log.action || 'Login'}</span></td>
                  <td>${log.details || 'เข้าสู่ระบบ'}</td>
                  <td>${statusHtml}</td>
                </tr>
              `;
            }).join('')
          : '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--muted);">ไม่พบข้อมูลบันทึกประวัติการเข้าใช้งาน</td></tr>';
      } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#d32f2f;">${err.message}</td></tr>`;
      }
    }

    async function loadSystemStats() {
      const cpuText = document.getElementById('cpuUsageText');
      const memoryText = document.getElementById('memoryUsageText');
      const dbTypeText = document.getElementById('databaseTypeText');
      const apiLatencyText = document.getElementById('apiResponseTimeText');
      const auditTerminal = document.getElementById('auditLogTerminal');

      if (!cpuText) return;

      try {
        const stats = await apiRequest('/api/admin/system-stats');
        cpuText.textContent = stats.cpu_usage;
        memoryText.textContent = stats.memory_usage;
        dbTypeText.textContent = stats.database_type;
        apiLatencyText.textContent = stats.api_response_time;

        if (auditTerminal && Array.isArray(stats.audit_logs)) {
          auditTerminal.innerHTML = stats.audit_logs.length
            ? stats.audit_logs.map(log => `
                <div class="audit-log-line">
                  <span class="audit-log-time">[${log.created_at || 'NOW'}]</span>
                  <span class="audit-log-level ${log.level || 'INFO'}">[${log.level || 'INFO'}]</span>
                  <span>${log.message}</span>
                </div>
              `).join('')
            : '<div class="audit-log-line">ไม่มีบันทึก Audit Logs</div>';
          auditTerminal.scrollTop = 0;
        }
      } catch (err) {
        if (auditTerminal) {
          auditTerminal.innerHTML = `<div class="audit-log-line" style="color:#f38ba8;">[ERROR] Failed to fetch system stats: ${err.message}</div>`;
        }
      }
    }

    // ===================== WEB & APP TRAFFIC ANALYTICS CONTROLLER =====================
    let dailyChartInstance = null;
    let hourlyChartInstance = null;
    let deviceChartInstance = null;
    let analyticsRangeDays = 7;
    let cachedRecentTraffic = [];

    async function initAnalyticsDashboard() {
      const btnRefresh = document.getElementById('btnRefreshAnalytics');
      const rangeBtns = document.querySelectorAll('#analyticsRangeButtons .range-btn');
      const searchInput = document.getElementById('trafficSearchInput');

      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          loadAllAnalytics(true);
        });
      }

      if (rangeBtns) {
        rangeBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            rangeBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            analyticsRangeDays = parseInt(btn.dataset.days || '7', 10);
            loadDailyVisitorsChart();
          });
        });
      }

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          renderRecentTrafficTable(e.target.value.trim().toLowerCase());
        });
      }

      await loadAllAnalytics();
    }

    async function loadAllAnalytics(showFeedback = false) {
      const btnRefresh = document.getElementById('btnRefreshAnalytics');
      if (btnRefresh && showFeedback) {
        btnRefresh.classList.add('loading');
        btnRefresh.textContent = '⏳ กำลังอัปเดต...';
      }

      try {
        await Promise.allSettled([
          loadAnalyticsOverview(),
          loadDailyVisitorsChart(),
          loadHourlyTrafficChart(),
          loadDeviceBreakdownChart(),
          loadTopPagesList(),
          loadRecentTrafficStream()
        ]);
      } catch (e) {
        console.error('[Analytics Load Error]', e);
      } finally {
        if (btnRefresh && showFeedback) {
          btnRefresh.classList.remove('loading');
          btnRefresh.innerHTML = '<span>🔄</span> รีเฟรชสถิติ';
        }
      }
    }

    async function loadAnalyticsOverview() {
      try {
        const overview = await apiRequest('/api/admin/analytics/overview');

        const kpiTodayViews = document.getElementById('kpiTodayViews');
        const kpiTodayUniques = document.getElementById('kpiTodayUniques');
        const kpiActiveNow = document.getElementById('kpiActiveNow');
        const kpiTotalVisits = document.getElementById('kpiTotalVisits');
        const kpiMemberRatio = document.getElementById('kpiMemberRatio');

        if (kpiTodayViews) kpiTodayViews.textContent = Number(overview.today_visits || 0).toLocaleString();
        if (kpiTodayUniques) kpiTodayUniques.textContent = Number(overview.today_uniques || 0).toLocaleString();
        if (kpiActiveNow) kpiActiveNow.textContent = Number(overview.active_now || 1).toLocaleString();
        if (kpiTotalVisits) kpiTotalVisits.textContent = Number(overview.total_visits || 0).toLocaleString();

        if (kpiMemberRatio) {
          const totalKnown = (overview.member_visits || 0) + (overview.guest_visits || 0);
          if (totalKnown > 0) {
            const memPct = Math.round((overview.member_visits / totalKnown) * 100);
            const guestPct = 100 - memPct;
            kpiMemberRatio.textContent = `สมาชิก ${memPct}% • ทั่วไป ${guestPct}%`;
          } else {
            kpiMemberRatio.textContent = 'สมาชิก 0% • ทั่วไป 0%';
          }
        }

        // Insights banner
        const peak = overview.peak_insights;
        const peakHoursHighlight = document.getElementById('peakHoursHighlight');
        const peakInsightDesc = document.getElementById('peakInsightDesc');
        const peakDayBadge = document.getElementById('peakDayBadge');

        if (peakHoursHighlight && peak) {
          peakHoursHighlight.textContent = `ช่วงเวลาคนเข้าใช้แอพเยอะสุด: ${peak.peak_hours || '20:00 - 23:00 น.'}`;
        }
        if (peakInsightDesc && peak) {
          peakInsightDesc.textContent = peak.recommendation || 'แนะนำจัดกิจกรรมหรือส่งแจ้งเตือนในระบบช่วงเวลาพีค เพื่อให้สมาชิกเห็นมากที่สุด';
        }
        if (peakDayBadge && peak) {
          peakDayBadge.textContent = `📅 วันที่คนเข้าเยอะสุด: ${peak.peak_day || 'วันเสาร์'}`;
        }
      } catch (err) {
        console.error('[Load Analytics Overview Error]', err);
      }
    }

    async function loadDailyVisitorsChart() {
      const canvas = document.getElementById('dailyVisitorsChart');
      if (!canvas || typeof Chart === 'undefined') return;

      try {
        const data = await apiRequest(`/api/admin/analytics/daily?days=${analyticsRangeDays}`);
        const subtitle = document.getElementById('dailyVisitorsSubtitle');
        if (subtitle) {
          subtitle.textContent = `แสดงยอดเปิดหน้าและผู้เข้าชมไม่ซ้ำคน ย้อนหลัง ${analyticsRangeDays} วัน`;
        }

        const labels = data.map(d => d.label);
        const pageviews = data.map(d => d.pageviews);
        const uniques = data.map(d => d.uniques);

        if (dailyChartInstance) {
          dailyChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const purpleGrad = ctx.createLinearGradient(0, 0, 0, 260);
        purpleGrad.addColorStop(0, 'rgba(124, 58, 237, 0.35)');
        purpleGrad.addColorStop(1, 'rgba(124, 58, 237, 0.00)');

        dailyChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'ยอดเปิดหน้าเว็บ (Pageviews)',
                data: pageviews,
                borderColor: '#7c3aed',
                backgroundColor: purpleGrad,
                fill: true,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#7c3aed'
              },
              {
                label: 'ผู้เข้าชมไม่ซ้ำคน (Unique Visitors)',
                data: uniques,
                borderColor: '#00b4d8',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 3.5,
                pointHoverRadius: 6,
                pointBackgroundColor: '#00b4d8'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  boxWidth: 12,
                  boxHeight: 12,
                  font: { family: 'Prompt, sans-serif', size: 12 }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(23, 23, 37, 0.9)',
                titleFont: { family: 'Prompt, sans-serif' },
                bodyFont: { family: 'Prompt, sans-serif' },
                padding: 10,
                cornerRadius: 8
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: { family: 'Prompt, sans-serif', size: 11 } }
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: { precision: 0, font: { family: 'Prompt, sans-serif', size: 11 } }
              }
            }
          }
        });
      } catch (err) {
        console.error('[Load Daily Chart Error]', err);
      }
    }

    async function loadHourlyTrafficChart() {
      const canvas = document.getElementById('hourlyTrafficChart');
      if (!canvas || typeof Chart === 'undefined') return;

      try {
        const res = await apiRequest('/api/admin/analytics/hourly');
        const hours = res.hours || [];
        const peakHour = res.peakHour;

        const labels = hours.map(h => h.label);
        const dataVisits = hours.map(h => h.visits);

        const bgColors = hours.map(h => {
          if (h.hour >= peakHour && h.hour <= (peakHour + 2) % 24) {
            return '#ff7043';
          }
          return 'rgba(124, 58, 237, 0.55)';
        });

        if (hourlyChartInstance) {
          hourlyChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        hourlyChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'จำนวนผู้เข้าใช้งาน (Visits)',
                data: dataVisits,
                backgroundColor: bgColors,
                borderRadius: 6,
                borderSkipped: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(23, 23, 37, 0.9)',
                titleFont: { family: 'Prompt, sans-serif' },
                bodyFont: { family: 'Prompt, sans-serif' },
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                  title: (items) => `เวลา ${items[0].label} น.`,
                  label: (item) => {
                    const h = hours[item.dataIndex];
                    const isPeak = (h.hour >= peakHour && h.hour <= (peakHour + 2) % 24);
                    return `${item.raw} ครั้ง ${isPeak ? '🔥 (ช่วงพีค)' : ''}`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  maxRotation: 0,
                  font: { family: 'Prompt, sans-serif', size: 10 },
                  callback: function(val, idx) {
                    return idx % 2 === 0 ? labels[idx] : '';
                  }
                }
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: { precision: 0, font: { family: 'Prompt, sans-serif', size: 11 } }
              }
            }
          }
        });
      } catch (err) {
        console.error('[Load Hourly Chart Error]', err);
      }
    }

    async function loadDeviceBreakdownChart() {
      const canvas = document.getElementById('deviceBreakdownChart');
      if (!canvas || typeof Chart === 'undefined') return;

      try {
        const res = await apiRequest('/api/admin/analytics/devices');
        const devices = res.devices || [];
        const browsers = res.browsers || [];

        const labels = devices.map(d => d.device_type);
        const counts = devices.map(d => d.count);
        const palette = ['#7c3aed', '#00b4d8', '#ff7043', '#10b981', '#f59e0b'];

        if (deviceChartInstance) {
          deviceChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        deviceChartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [
              {
                data: counts,
                backgroundColor: palette.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#ffffff'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  boxWidth: 12,
                  font: { family: 'Prompt, sans-serif', size: 11 }
                }
              }
            }
          }
        });

        // Peak device badge
        const peakDeviceBadge = document.getElementById('peakDeviceBadge');
        if (peakDeviceBadge && devices.length > 0) {
          const topDev = devices[0];
          const totalDevCount = devices.reduce((sum, d) => sum + d.count, 0);
          const pct = Math.round((topDev.count / (totalDevCount || 1)) * 100);
          peakDeviceBadge.textContent = `📱 อุปกรณ์ยอดนิยม: ${topDev.device_type} (${pct}%)`;
        }

        // Render browser list
        const browserContainer = document.getElementById('browserStatsList');
        if (browserContainer) {
          const totalBrowserCount = browsers.reduce((sum, b) => sum + b.count, 0) || 1;
          browserContainer.innerHTML = browsers.map(b => {
            const pct = Math.round((b.count / totalBrowserCount) * 100);
            return `
              <div class="browser-stat-item">
                <div class="browser-stat-header">
                  <span class="browser-name">${escapeHtml(b.browser)}</span>
                  <span class="browser-count">${b.count} ครั้ง (${pct}%)</span>
                </div>
                <div class="stat-progress-bg">
                  <div class="stat-progress-bar" style="width: ${pct}%;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      } catch (err) {
        console.error('[Load Devices Chart Error]', err);
      }
    }

    async function loadTopPagesList() {
      const container = document.getElementById('topPagesList');
      if (!container) return;

      try {
        const pages = await apiRequest('/api/admin/analytics/top-pages');
        if (!pages || pages.length === 0) {
          container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">ไม่มีข้อมูลการเข้าชม</div>';
          return;
        }

        const maxVisits = Math.max(...pages.map(p => p.visits), 1);
        container.innerHTML = pages.map((p, idx) => {
          const pct = Math.round((p.visits / maxVisits) * 100);
          return `
            <div class="top-page-row">
              <div class="top-page-rank">#${idx + 1}</div>
              <div class="top-page-info">
                <div class="top-page-title-line">
                  <strong class="top-page-title">${escapeHtml(p.readable_name)}</strong>
                  <span class="top-page-count">${p.visits} ครั้ง</span>
                </div>
                <div class="stat-progress-bg">
                  <div class="stat-progress-bar" style="width: ${pct}%; background: linear-gradient(90deg, var(--purple), #00b4d8);"></div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } catch (err) {
        container.innerHTML = `<div style="color:var(--danger); text-align:center; padding:10px;">เกิดข้อผิดพลาด: ${err.message}</div>`;
      }
    }

    async function loadRecentTrafficStream() {
      try {
        const logs = await apiRequest('/api/admin/analytics/recent');
        cachedRecentTraffic = Array.isArray(logs) ? logs : [];
        renderRecentTrafficTable();
      } catch (err) {
        const tbody = document.getElementById('liveTrafficTableBody');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger); padding:20px;">ไม่สามารถโหลดประวัติการเข้าชมได้</td></tr>`;
        }
      }
    }

    function renderRecentTrafficTable(filterQuery = '') {
      const tbody = document.getElementById('liveTrafficTableBody');
      if (!tbody) return;

      let filtered = cachedRecentTraffic;
      if (filterQuery) {
        filtered = cachedRecentTraffic.filter(log => {
          const text = `${log.path} ${log.ip} ${log.browser} ${log.os} ${log.user_name || ''} ${log.user_email || ''}`.toLowerCase();
          return text.includes(filterQuery);
        });
      }

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--muted);">ไม่พบประวัติการเข้าชมที่ตรงกัน</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(log => {
        const hasUser = Boolean(log.user_id && log.user_name);
        const userBadge = hasUser
          ? `<div style="display:flex; flex-direction:column;"><strong style="color:var(--purple);">${escapeHtml(log.user_name)}</strong><span style="font-size:0.75rem; color:var(--muted);">${escapeHtml(log.user_email || '')}</span></div>`
          : '<span class="badge" style="background:#f1f5f9; color:#64748b;">👤 Guest / ทั่วไป</span>';

        const deviceIcon = log.device_type === 'Mobile' ? '📱' : (log.device_type === 'Tablet' ? '📟' : '💻');

        return `
          <tr>
            <td style="font-size:0.8rem; font-family:monospace; color:var(--muted);">${formatTrafficTime(log.created_at)}</td>
            <td><strong style="color:#0284c7; font-size:0.85rem;">${escapeHtml(log.path)}</strong></td>
            <td>${userBadge}</td>
            <td>${deviceIcon} ${escapeHtml(log.device_type)} (${escapeHtml(log.os)})</td>
            <td>${escapeHtml(log.browser)}</td>
            <td style="font-size:0.8rem; font-family:monospace;">${escapeHtml(log.ip || '-')}</td>
          </tr>
        `;
      }).join('');
    }

    function formatTrafficTime(timeStr) {
      if (!timeStr) return '-';
      try {
        const d = new Date(timeStr);
        if (isNaN(d.getTime())) return timeStr;
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}/${mo} ${h}:${m}:${s}`;
      } catch (e) {
        return timeStr;
      }
    }

    loadAdminDashboard();
    initAnalyticsDashboard();
  }

  // ===================== ADMIN USERS MANAGEMENT (admin-users.html) =====================
  if (adminUsersTableBody) {
    let allAdminUsers = [];
    const searchInput = document.getElementById('userSearchInput');
    const filterGender = document.getElementById('filterGender');
    const filterRole = document.getElementById('filterRole');
    const filterStatus = document.getElementById('filterStatus');
    const btnRefresh = document.getElementById('btnRefreshUsers');
    const modal = document.getElementById('userDetailModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalBody = document.getElementById('modalUserContent');
    const modalTitle = document.getElementById('modalUserName');
    const logoutBtn = document.getElementById('logoutButton');

    let currentUserSession = null;

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await apiRequest('/api/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }

    if (modalCloseBtn && modal) {
      modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }

    async function loadAdminUsers() {
      try {
        const session = await apiRequest('/api/session');
        if (!session.user || (!session.user.is_admin && session.user.role !== 'admin' && session.user.role !== 'owner')) {
          window.location.href = '/';
          return;
        }
        currentUserSession = session.user;

        allAdminUsers = await apiRequest('/api/users');
        updateUserStats(allAdminUsers);
        renderFilteredUsers();
      } catch (err) {
        adminUsersTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--danger); padding:20px;">⚠️ ${escapeHtml(err.message || 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้')}</td></tr>`;
      }
    }

    function updateUserStats(users) {
      const total = users.length;
      let male = 0, female = 0, lgbtq = 0, active = 0, banned = 0;
      for (const u of users) {
        if (u.gender === 'ชาย') male++;
        else if (u.gender === 'หญิง') female++;
        else if (u.gender === 'เพศหลากหลาย') lgbtq++;

        if (u.is_active === 0) banned++;
        else active++;
      }

      const totalEl = document.getElementById('countTotalUsers');
      if (totalEl) totalEl.textContent = total;
      const maleEl = document.getElementById('countMaleUsers');
      if (maleEl) maleEl.textContent = male;
      const femaleEl = document.getElementById('countFemaleUsers');
      if (femaleEl) femaleEl.textContent = female;
      const lgbtqEl = document.getElementById('countLgbtqUsers');
      if (lgbtqEl) lgbtqEl.textContent = lgbtq;
      const activeEl = document.getElementById('countActiveUsers');
      if (activeEl) activeEl.textContent = active;
      const bannedEl = document.getElementById('countBannedUsers');
      if (bannedEl) bannedEl.textContent = banned;
    }

    function renderFilteredUsers() {
      const q = (searchInput?.value || '').toLowerCase().trim();
      const genderFilter = filterGender?.value || '';
      const roleFilter = filterRole?.value || '';
      const statusFilter = filterStatus?.value || '';

      const filtered = allAdminUsers.filter(u => {
        if (genderFilter && u.gender !== genderFilter) return false;
        if (roleFilter && (u.role || (u.is_admin ? 'admin' : 'user')) !== roleFilter) return false;
        if (statusFilter === 'active' && u.is_active === 0) return false;
        if (statusFilter === 'banned' && u.is_active !== 0) return false;
        if (q) {
          const matchName = (u.name || '').toLowerCase().includes(q);
          const matchEmail = (u.email || '').toLowerCase().includes(q);
          const matchPhone = (u.phone || '').toLowerCase().includes(q);
          const matchNick = (u.nickname || '').toLowerCase().includes(q);
          const matchMajor = (u.major || '').toLowerCase().includes(q);
          const matchInterests = (u.interests || '').toLowerCase().includes(q);
          if (!matchName && !matchEmail && !matchPhone && !matchNick && !matchMajor && !matchInterests) return false;
        }
        return true;
      });

      const countEl = document.getElementById('userCountDisplay');
      if (countEl) countEl.textContent = filtered.length;

      if (!filtered.length) {
        adminUsersTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--muted);">ไม่พบข้อมูลผู้ใช้ที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
        return;
      }

      const isOwner = currentUserSession && currentUserSession.role === 'owner';
      const thAdminUserPass = document.getElementById('thAdminUserPass');
      if (thAdminUserPass) {
        thAdminUserPass.style.display = isOwner ? '' : 'none';
      }

      adminUsersTableBody.innerHTML = filtered.map(user => {
        const userRole = user.role || (user.is_admin ? 'admin' : 'user');
        const isBanned = user.is_active === 0;
        const avatarImg = user.profile_image
          ? `<img src="${escapeHtml(user.profile_image)}" class="user-table-avatar" alt="${escapeHtml(user.name)}" data-view-detail-id="${user.id}" />`
          : `<div class="user-table-avatar-initial" data-view-detail-id="${user.id}">${escapeHtml((user.name || 'U').charAt(0))}</div>`;

        const resetPasswordTd = isOwner ? `
          <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:4px;">
                <span id="uPassText-${user.id}" style="font-family:monospace; font-weight:bold; color:var(--purple); background:#f0edff; padding:2px 6px; border-radius:4px; font-size:0.8rem;">••••••••</span>
                <button type="button" class="inline-button review" data-uaction-toggle-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:2px 6px; font-size:0.75rem;" title="ดู/ซ่อนรหัสผ่าน">👁️</button>
              </div>
              <button type="button" class="inline-button review" data-uaction-reset-pass="${user.id}" data-user-email="${escapeHtml(user.email)}" style="padding:2px 6px; font-size:0.75rem;">🔑 เปลี่ยนรหัส</button>
            </div>
          </td>
        ` : '';

        const roleSelectHtml = isOwner ? `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <select data-urole-select-id="${user.id}" style="padding:3px 6px; border-radius:6px; border:1px solid #ccc; font-size:0.8rem;">
              <option value="user" ${userRole === 'user' ? 'selected' : ''}>User (ทั่วไป)</option>
              <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Admin (ผู้ดูแล)</option>
              <option value="owner" ${userRole === 'owner' ? 'selected' : ''}>Owner (ผู้ดูแลสูงสุด)</option>
            </select>
            <button class="inline-button review" data-uaction-save-role="${user.id}" style="padding:2px 6px; font-size:0.75rem;">บันทึกสิทธิ์</button>
          </div>
        ` : `<span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span>`;

        const interestsList = (user.interests || '').split(',').map(s => s.trim()).filter(Boolean);
        const interestsHtml = interestsList.length
          ? interestsList.slice(0, 3).map(t => `<span class="interest-tag-pill">${escapeHtml(t)}</span>`).join('') + (interestsList.length > 3 ? `<span class="interest-tag-pill">+${interestsList.length - 3}</span>` : '')
          : '<span style="color:#bbb; font-size:0.75rem;">-</span>';

        return `
          <tr>
            <td>
              <div class="user-profile-cell">
                ${avatarImg}
                <div>
                  <div class="user-name-title">
                    <span style="cursor:pointer;" data-view-detail-id="${user.id}">${escapeHtml(user.name)}</span>
                    <span class="user-id-badge">#${user.id}</span>
                  </div>
                  ${user.nickname ? `<div class="user-nickname-pill">ชื่อเล่น: ${escapeHtml(user.nickname)}</div>` : ''}
                </div>
              </div>
            </td>
            <td>
              <div class="user-contact-email">${escapeHtml(user.email)}</div>
              ${user.phone ? `<div class="user-contact-phone">📞 ${escapeHtml(user.phone)}</div>` : '<div style="color:#bbb; font-size:0.75rem;">ไม่มีเบอร์</div>'}
            </td>
            <td>
              <div><strong>${escapeHtml(user.gender || 'ไม่ระบุ')}</strong></div>
              <div style="font-size:0.8rem; color:var(--muted);">${user.age ? user.age + ' ปี' : 'ไม่ระบุอายุ'} • ${escapeHtml(user.year || '-')}</div>
            </td>
            <td>
              <div style="font-weight:600; color:var(--purple-dark); font-size:0.86rem;">${escapeHtml(user.major || '-')}</div>
              ${user.university ? `<div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">🏫 ${escapeHtml(user.university)}</div>` : ''}
            </td>
            <td>
              <div>${interestsHtml}</div>
              ${user.bio ? `<div class="bio-snippet" title="${escapeHtml(user.bio)}">${escapeHtml(user.bio)}</div>` : ''}
            </td>
            ${resetPasswordTd}
            <td>${roleSelectHtml}</td>
            <td>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button class="inline-button ${isBanned ? 'resolve' : 'reject'}" data-uaction-ban="${user.id}" data-action="${isBanned ? 'enable' : 'disable'}" style="padding:4px 8px; font-size:0.78rem;">
                  ${isBanned ? '✅ ปลดแบน' : '🚫 แบนผู้ใช้'}
                </button>
                <button class="inline-button review" data-view-detail-id="${user.id}" style="padding:4px 8px; font-size:0.78rem; background:#6366f1; color:white;">
                  🔍 ดูข้อมูลเต็ม
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      attachUserTableEvents();
    }

    function attachUserTableEvents() {
      const isOwner = currentUserSession && currentUserSession.role === 'owner';
      if (isOwner) {
        adminUsersTableBody.querySelectorAll('[data-uaction-toggle-pass]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.uactionTogglePass;
            const passEl = document.getElementById(`uPassText-${userId}`);
            if (!passEl) return;

            if (passEl.dataset.revealed === 'true') {
              passEl.textContent = '••••••••';
              passEl.dataset.revealed = 'false';
              btn.textContent = '👁️';
              return;
            }

            if (passEl.dataset.plain) {
              passEl.textContent = passEl.dataset.plain;
              passEl.dataset.revealed = 'true';
              btn.textContent = '🔒';
              return;
            }

            btn.disabled = true;
            btn.textContent = '⏳';
            try {
              const res = await apiRequest(`/api/admin/users/${userId}/reveal-password`, { method: 'POST' });
              const pass = res.password || '(สมัครผ่าน Google หรือไม่มีรหัส)';
              passEl.dataset.plain = pass;
              passEl.textContent = pass;
              passEl.dataset.revealed = 'true';
              btn.textContent = '🔒';
            } catch (e) {
              alert('ไม่สามารถถอดรหัสผ่านได้: ' + e.message);
              btn.textContent = '👁️';
            } finally {
              btn.disabled = false;
            }
          });
        });
      }

      // Reset password
      adminUsersTableBody.querySelectorAll('[data-uaction-reset-pass]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.uactionResetPass;
          const userEmail = btn.dataset.userEmail;
          const newPassword = prompt(`กรอกรหัสผ่านใหม่สำหรับ ${userEmail}:`);
          if (newPassword && newPassword.trim()) {
            try {
              const res = await apiRequest(`/api/admin/users/${userId}/password`, {
                method: 'PUT',
                body: JSON.stringify({ new_password: newPassword.trim() })
              });
              alert(res.message);
              await loadAdminUsers();
            } catch(e) {
              alert('เกิดข้อผิดพลาด: ' + e.message);
            }
          }
        });
      });

      // Save role
      adminUsersTableBody.querySelectorAll('[data-uaction-save-role]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.uactionSaveRole;
          const selectEl = document.querySelector(`[data-urole-select-id="${userId}"]`);
          const newRole = selectEl ? selectEl.value : 'user';
          try {
            const res = await apiRequest(`/api/admin/users/${userId}/role`, {
              method: 'PUT',
              body: JSON.stringify({ role: newRole })
            });
            alert(res.message);
            await loadAdminUsers();
          } catch(e) {
            alert('เกิดข้อผิดพลาด: ' + e.message);
          }
        });
      });

      // Ban / Unban
      adminUsersTableBody.querySelectorAll('[data-uaction-ban]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const userId = btn.dataset.uactionBan;
          const action = btn.dataset.action;
          try {
            const res = await apiRequest(`/api/users/${userId}/${action}`, { method: 'PATCH' });
            alert(res.message);
            await loadAdminUsers();
          } catch(e) {
            alert('เกิดข้อผิดพลาด: ' + e.message);
          }
        });
      });

      // View Detail Modal
      adminUsersTableBody.querySelectorAll('[data-view-detail-id]').forEach(el => {
        el.addEventListener('click', () => {
          const userId = Number(el.dataset.viewDetailId);
          const user = allAdminUsers.find(u => Number(u.id) === userId);
          if (user) openUserDetailModal(user);
        });
      });
    }

    function openUserDetailModal(user) {
      if (!modal || !modalBody) return;
      if (modalTitle) modalTitle.textContent = `ข้อมูลการสมัครสมาชิก: ${user.name} (#${user.id})`;

      const avatarSrc = user.profile_image
        ? `<img src="${escapeHtml(user.profile_image)}" class="modal-main-avatar" alt="${escapeHtml(user.name)}" />`
        : `<div class="modal-main-avatar-initial">${escapeHtml((user.name || 'U').charAt(0))}</div>`;

      const photos = user.photos && user.photos.length ? user.photos : (user.profile_image ? [user.profile_image] : []);
      const photosGridHtml = photos.length
        ? `
          <div style="margin-top:14px;">
            <div class="info-field-label">📸 รูปภาพทั้งหมด (${photos.length} รูป):</div>
            <div class="user-gallery-grid">
              ${photos.map(p => `
                <a href="${escapeHtml(p)}" target="_blank" title="คลิกเพื่อดูรูปขนาดเต็ม">
                  <img src="${escapeHtml(p)}" class="gallery-thumb" alt="Photo" />
                </a>
              `).join('')}
            </div>
          </div>
        `
        : '<div style="color:var(--muted); font-size:0.85rem; margin:8px 0;">ไม่มีรูปภาพเพิ่มเติม</div>';

      const interestsList = (user.interests || '').split(',').map(s => s.trim()).filter(Boolean);
      const interestsTagsHtml = interestsList.length
        ? interestsList.map(t => `<span class="interest-tag-pill" style="font-size:0.85rem; padding:4px 10px;">${escapeHtml(t)}</span>`).join(' ')
        : '<span style="color:var(--muted);">-</span>';

      const userRole = user.role || (user.is_admin ? 'admin' : 'user');
      const isBanned = user.is_active === 0;
      const isOwner = currentUserSession && currentUserSession.role === 'owner';

      modalBody.innerHTML = `
        <div class="user-detail-header-card">
          ${avatarSrc}
          <div style="flex:1;">
            <h3 style="margin:0 0 4px; color:var(--purple-dark); font-size:1.25rem;">
              ${escapeHtml(user.name)} ${user.nickname ? `(${escapeHtml(user.nickname)})` : ''}
            </h3>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px;">
              <span class="badge ${userRole === 'owner' ? 'resolved' : (userRole === 'admin' ? 'reviewed' : '')}">${userRole.toUpperCase()}</span>
              <span class="badge ${isBanned ? 'reject' : 'resolve'}">${isBanned ? '🚫 ถูกระงับ' : '✅ ใช้งานปกติ'}</span>
              <span class="user-id-badge" style="font-size:0.8rem;">ID: ${user.id}</span>
            </div>
          </div>
        </div>

        <div class="user-info-grid-2col">
          <div class="info-field-card">
            <div class="info-field-label">📧 อีเมล (Email)</div>
            <div class="info-field-value">${escapeHtml(user.email)}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">📞 เบอร์โทรศัพท์ (Phone)</div>
            <div class="info-field-value" style="color:#059669; font-weight:700;">${escapeHtml(user.phone || 'ไม่ระบุ')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">👤 ชื่อเล่น & เพศ</div>
            <div class="info-field-value">${escapeHtml(user.nickname || '-')} (${escapeHtml(user.gender || 'ไม่ระบุ')})</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🎂 อายุ & ชั้นปี</div>
            <div class="info-field-value">${user.age ? user.age + ' ปี' : 'ไม่ระบุ'} • ${escapeHtml(user.year || 'ไม่ระบุชั้นปี')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🏫 มหาวิทยาลัย (University)</div>
            <div class="info-field-value" style="color:var(--purple); font-weight:600;">${escapeHtml(user.university || 'มหาวิทยาลัยขอนแก่น')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🎓 คณะ / สาขา (Faculty / Major)</div>
            <div class="info-field-value" style="font-weight:600;">${escapeHtml(user.major || 'ไม่ระบุ')}</div>
          </div>
          <div class="info-field-card" style="grid-column: 1 / -1;">
            <div class="info-field-label">💡 ความสนใจ (Interests)</div>
            <div class="info-field-value" style="margin-top:4px;">${interestsTagsHtml}</div>
          </div>
          <div class="info-field-card" style="grid-column: 1 / -1;">
            <div class="info-field-label">📝 ประวัติโดยย่อ (Bio)</div>
            <div class="info-field-value" style="font-weight:normal; line-height:1.5;">${escapeHtml(user.bio || 'ไม่มีข้อมูล')}</div>
          </div>
          <div class="info-field-card">
            <div class="info-field-label">🕒 วันที่ลงทะเบียน</div>
            <div class="info-field-value" style="font-size:0.85rem;">${escapeHtml(user.created_at || '-')}</div>
          </div>
          ${isOwner ? `
            <div class="info-field-card">
              <div class="info-field-label">🔐 รหัสผ่าน (Owner)</div>
              <div class="info-field-value" style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <span id="modalPassText-${user.id}" style="font-family:monospace; color:var(--purple); font-weight:bold;">••••••••</span>
                <button type="button" class="inline-button review" id="btnModalRevealPass-${user.id}" style="padding:2px 8px; font-size:0.75rem;">👁️ ดูรหัส</button>
              </div>
            </div>
          ` : ''}
        </div>

        ${photosGridHtml}
      `;

      modal.classList.remove('hidden');

      if (isOwner) {
        const btnModalReveal = document.getElementById(`btnModalRevealPass-${user.id}`);
        const modalPassEl = document.getElementById(`modalPassText-${user.id}`);
        if (btnModalReveal && modalPassEl) {
          btnModalReveal.addEventListener('click', async () => {
            if (modalPassEl.dataset.revealed === 'true') {
              modalPassEl.textContent = '••••••••';
              modalPassEl.dataset.revealed = 'false';
              btnModalReveal.textContent = '👁️ ดูรหัส';
              return;
            }
            if (modalPassEl.dataset.plain) {
              modalPassEl.textContent = modalPassEl.dataset.plain;
              modalPassEl.dataset.revealed = 'true';
              btnModalReveal.textContent = '🔒 ซ่อน';
              return;
            }
            btnModalReveal.disabled = true;
            btnModalReveal.textContent = '⏳';
            try {
              const res = await apiRequest(`/api/admin/users/${user.id}/reveal-password`, { method: 'POST' });
              const pass = res.password || '(สมัครผ่าน Google หรือไม่มีรหัส)';
              modalPassEl.dataset.plain = pass;
              modalPassEl.textContent = pass;
              modalPassEl.dataset.revealed = 'true';
              btnModalReveal.textContent = '🔒 ซ่อน';
            } catch (e) {
              alert('ไม่สามารถถอดรหัสผ่านได้: ' + e.message);
              btnModalReveal.textContent = '👁️ ดูรหัส';
            } finally {
              btnModalReveal.disabled = false;
            }
          });
        }
      }
    }

    if (searchInput) searchInput.addEventListener('input', renderFilteredUsers);
    if (filterGender) filterGender.addEventListener('change', renderFilteredUsers);
    if (filterRole) filterRole.addEventListener('change', renderFilteredUsers);
    if (filterStatus) filterStatus.addEventListener('change', renderFilteredUsers);
    if (btnRefresh) btnRefresh.addEventListener('click', loadAdminUsers);

    loadAdminUsers();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminModule);
} else {
  initAdminModule();
}
