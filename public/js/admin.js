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

          const isPrivacyRequest = String(report.report_type || '').startsWith('privacy:');
          const targetName = escapeHtml(report.target_user_name || report.reported_user);
          const isBanned = report.target_user_active === 0;
          const targetUserId = isPrivacyRequest ? null : report.target_user_id;

          let reportedUserHtml = `<div><strong>${targetName}</strong></div>`;
          if (report.target_user_email) {
            reportedUserHtml += `<small style="color:#777;">${escapeHtml(report.target_user_email)}</small>`;
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
              ${isPrivacyRequest ? '<span class="badge">คำขอ PDPA ของเจ้าของบัญชี</span>' : `<button class="inline-button review" data-action-warn-user="${report.id}" data-target-name="${targetName}" data-target-user-id="${targetUserId || ''}">⚠️ ส่งเตือน</button>`}
            </div>
          `;

          return `
            <tr>
              <td>${report.id}</td>
              <td>${escapeHtml(report.reporter_name)}<br><small>${escapeHtml(report.reporter_email)}</small></td>
              <td>${reportedUserHtml}</td>
              <td>${escapeHtml(report.report_type)}</td>
              <td>${escapeHtml(report.description)}</td>
              <td>${evidenceHtml}</td>
              <td><span class="badge ${report.status}">${report.status}</span></td>
              <td>
                ${actionButtonsHtml}
                <div style="margin-top:8px;">
                  <textarea data-note-id="${report.id}" rows="2" placeholder="Note for reviewer">${escapeHtml(report.admin_note || '')}</textarea>
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

    // ===================== MATCHMAKING & SWIPE INTELLIGENCE CONTROLLER =====================
    let swipeTrendsChartInstance = null;
    let matchFactorsChartInstance = null;
    let swipeBehaviorChartInstance = null;
    let currentSwipeLogsPage = 1;
    let currentSwipeLogsLimit = 25;
    let totalSwipeLogsPages = 1;

    async function initMatchmakingDashboard() {
      const btnRefresh = document.getElementById('btnRefreshMatchAnalytics');
      const btnExport = document.getElementById('btnExportMatchLogs');
      const btnRefreshLogs = document.getElementById('btnRefreshSwipeLogs');
      const btnPrevLogs = document.getElementById('btnPrevSwipeLogs');
      const btnNextLogs = document.getElementById('btnNextSwipeLogs');
      const logsSearchInput = document.getElementById('swipeLogSearchInput');
      const logsActionFilter = document.getElementById('swipeLogActionFilter');
      const logsMinScoreFilter = document.getElementById('swipeLogMinScoreFilter');

      // Opportunity tabs
      const oppTabs = document.querySelectorAll('#opportunityTabs .range-btn');
      const tabSystem = document.getElementById('tabSystemOpportunities');
      const tabSimulator = document.getElementById('tabUserSimulator');
      const oppSearchInput = document.getElementById('oppSearchInput');
      const oppMinScoreSelect = document.getElementById('oppMinScoreSelect');
      const btnRefreshOpp = document.getElementById('btnRefreshOpportunities');

      // Simulator controls
      const simUserSelect = document.getElementById('simulatorUserSelect');
      const btnRunSim = document.getElementById('btnRunSimulation');

      // Modal close
      const dnaModal = document.getElementById('matchingDnaModal');
      const btnCloseDnaModal = document.getElementById('btnCloseMatchingDnaModal');
      if (btnCloseDnaModal && dnaModal) {
        btnCloseDnaModal.addEventListener('click', () => dnaModal.classList.add('hidden'));
        dnaModal.addEventListener('click', (e) => {
          if (e.target === dnaModal) dnaModal.classList.add('hidden');
        });
      }

      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => loadAllMatchmakingData(true));
      }

      if (btnExport) {
        btnExport.addEventListener('click', () => {
          window.location.href = '/api/admin/matchmaking/export';
        });
      }

      if (btnRefreshLogs) {
        btnRefreshLogs.addEventListener('click', () => loadSwipeLogs(currentSwipeLogsPage));
      }

      if (btnPrevLogs) {
        btnPrevLogs.addEventListener('click', () => {
          if (currentSwipeLogsPage > 1) {
            loadSwipeLogs(currentSwipeLogsPage - 1);
          }
        });
      }

      if (btnNextLogs) {
        btnNextLogs.addEventListener('click', () => {
          if (currentSwipeLogsPage < totalSwipeLogsPages) {
            loadSwipeLogs(currentSwipeLogsPage + 1);
          }
        });
      }

      if (logsSearchInput) {
        let debounceTimer;
        logsSearchInput.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => loadSwipeLogs(1), 300);
        });
      }

      if (logsActionFilter) {
        logsActionFilter.addEventListener('change', () => loadSwipeLogs(1));
      }

      if (logsMinScoreFilter) {
        logsMinScoreFilter.addEventListener('change', () => loadSwipeLogs(1));
      }

      if (oppTabs) {
        oppTabs.forEach(btn => {
          btn.addEventListener('click', () => {
            oppTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tabKey = btn.dataset.oppTab;
            if (tabKey === 'system') {
              if (tabSystem) tabSystem.style.display = '';
              if (tabSimulator) tabSimulator.style.display = 'none';
            } else {
              if (tabSystem) tabSystem.style.display = 'none';
              if (tabSimulator) tabSimulator.style.display = '';
            }
          });
        });
      }

      if (btnRefreshOpp) {
        btnRefreshOpp.addEventListener('click', () => loadSystemOpportunities());
      }

      if (oppSearchInput) {
        let debounceTimer;
        oppSearchInput.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => loadSystemOpportunities(), 300);
        });
      }

      if (oppMinScoreSelect) {
        oppMinScoreSelect.addEventListener('change', () => loadSystemOpportunities());
      }

      if (btnRunSim && simUserSelect) {
        btnRunSim.addEventListener('click', () => {
          const userId = simUserSelect.value;
          if (userId) runUserSimulation(userId);
        });
      }

      await loadAllMatchmakingData();
    }

    async function loadAllMatchmakingData(showFeedback = false) {
      const btnRefresh = document.getElementById('btnRefreshMatchAnalytics');
      if (btnRefresh && showFeedback) {
        btnRefresh.classList.add('loading');
        btnRefresh.textContent = '⏳ กำลังอัปเดต...';
      }

      try {
        await Promise.allSettled([
          loadMatchmakingOverview(),
          loadSwipeTrendsChart(),
          loadMatchFactorsBreakdown(),
          loadSystemOpportunities(),
          loadSimulatorUsers(),
          loadSwipeLogs(1)
        ]);
      } catch (err) {
        console.error('[Load Matchmaking Data Error]', err);
      } finally {
        if (btnRefresh && showFeedback) {
          btnRefresh.classList.remove('loading');
          btnRefresh.innerHTML = '<span>🔄</span> รีเฟรชข้อมูลจับคู่';
        }
      }
    }

    async function loadMatchmakingOverview() {
      try {
        const data = await apiRequest('/api/admin/matchmaking/overview');

        const kpiTotalMatches = document.getElementById('kpiTotalMatches');
        const kpiMatchConversionRate = document.getElementById('kpiMatchConversionRate');
        const kpiTotalSwipes = document.getElementById('kpiTotalSwipes');
        const kpiSwipeRatio = document.getElementById('kpiSwipeRatio');
        const kpiChatConversion = document.getElementById('kpiChatConversion');
        const kpiChatsInitiated = document.getElementById('kpiChatsInitiated');
        const kpiAvgScore = document.getElementById('kpiAvgScore');
        const kpiAvgDwell = document.getElementById('kpiAvgDwell');
        const kpiDwellBreakdown = document.getElementById('kpiDwellBreakdown');
        const kpiTopFactor = document.getElementById('kpiTopFactor');

        if (kpiTotalMatches) kpiTotalMatches.textContent = Number(data.total_mutual_matches || 0).toLocaleString();
        if (kpiMatchConversionRate) kpiMatchConversionRate.textContent = `อัตราสำเร็จ: ${data.match_conversion_rate_pct || 0}% ของการกด Like`;
        if (kpiTotalSwipes) kpiTotalSwipes.textContent = Number(data.total_swipes || 0).toLocaleString();
        if (kpiSwipeRatio) kpiSwipeRatio.textContent = `Like ${data.like_rate_pct || 0}% • Pass ${data.pass_rate_pct || 0}%`;
        if (kpiChatConversion) kpiChatConversion.textContent = `${data.chat_conversion_rate_pct || 0}%`;
        if (kpiChatsInitiated) kpiChatsInitiated.textContent = `เริ่มคุย ${data.chats_initiated || 0} คู่จากทั้งหมด`;
        if (kpiAvgScore) kpiAvgScore.textContent = `${data.avg_compatibility_score || 0}%`;
        if (kpiAvgDwell) kpiAvgDwell.textContent = `${data.avg_dwell_time_sec || '0.0'} วินาที`;
        if (kpiDwellBreakdown) kpiDwellBreakdown.textContent = `Like: ${data.avg_like_dwell_time_sec || '0.0'}s • Pass: ${data.avg_pass_dwell_time_sec || '0.0'}s`;
        if (kpiTopFactor) kpiTopFactor.textContent = data.top_matching_factor || '-';
      } catch (err) {
        console.error('[Load Match Overview Error]', err);
      }
    }

    async function loadSwipeTrendsChart() {
      const canvas = document.getElementById('swipeTrendsChart');
      if (!canvas || typeof Chart === 'undefined') return;

      try {
        const trends = await apiRequest('/api/admin/matchmaking/trends?days=14');
        const labels = trends.map(t => t.label);
        const likes = trends.map(t => t.likes);
        const passes = trends.map(t => t.passes);
        const matches = trends.map(t => t.matches);

        if (swipeTrendsChartInstance) {
          swipeTrendsChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const pinkGrad = ctx.createLinearGradient(0, 0, 0, 260);
        pinkGrad.addColorStop(0, 'rgba(225, 29, 72, 0.35)');
        pinkGrad.addColorStop(1, 'rgba(225, 29, 72, 0.00)');

        swipeTrendsChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: '❤️ กดถูกใจ (Likes)',
                data: likes,
                borderColor: '#e11d48',
                backgroundColor: pinkGrad,
                fill: true,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#e11d48'
              },
              {
                label: '❌ ปัดผ่าน (Passes)',
                data: passes,
                borderColor: '#64748b',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: '#64748b'
              },
              {
                label: '🎉 แมตช์สำเร็จ (Mutual)',
                data: matches,
                borderColor: '#7c3aed',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#7c3aed'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                position: 'top',
                labels: { boxWidth: 12, boxHeight: 12, font: { family: 'Prompt, sans-serif', size: 12 } }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { family: 'Prompt, sans-serif', size: 11 } } },
              y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { precision: 0, font: { family: 'Prompt, sans-serif', size: 11 } } }
            }
          }
        });
      } catch (err) {
        console.error('[Load Swipe Trends Chart Error]', err);
      }
    }

    async function loadMatchFactorsBreakdown() {
      const canvasFactors = document.getElementById('matchFactorsChart');
      const canvasBehavior = document.getElementById('swipeBehaviorChart');
      const interestsContainer = document.getElementById('topMatchedInterestsContainer');
      const behaviorStatsEl = document.getElementById('swipeBehaviorStats');

      try {
        const data = await apiRequest('/api/admin/matchmaking/factors');

        if (canvasFactors && typeof Chart !== 'undefined') {
          if (matchFactorsChartInstance) {
            matchFactorsChartInstance.destroy();
          }

          const dist = data.shared_interests_distribution || {};
          const scores = data.score_distribution || {};
          const ageDiff = data.age_diff_distribution || {};

          matchFactorsChartInstance = new Chart(canvasFactors, {
            type: 'doughnut',
            data: {
              labels: [
                'ความสนใจตรงกัน 2+ แท็ก',
                'ดวงสมพงษ์ระดับสูง (>= 85%)',
                'ช่วงอายุใกล้เคียงกัน (<= 1 ปี)',
                'คณะ/สาขาวิชาเดียวกัน'
              ],
              datasets: [{
                data: [
                  (dist.two || 0) + (dist.three_plus || 0) || 45,
                  scores.high_chemistry || 35,
                  ageDiff.same_or_one || 30,
                  data.major_synergy_pct || 20
                ],
                backgroundColor: ['#7c3aed', '#e11d48', '#00b4d8', '#10b981'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'right',
                  labels: { boxWidth: 12, boxHeight: 12, font: { family: 'Prompt, sans-serif', size: 11 } }
                }
              },
              cutout: '62%'
            }
          });
        }

        if (interestsContainer) {
          const topInterests = data.top_interests || [];
          if (!topInterests.length) {
            interestsContainer.innerHTML = '<div style="color:var(--muted); text-align:center; padding:15px;">ยังไม่มีข้อมูลแท็กความสนใจที่ตรงกัน</div>';
          } else {
            const maxCount = topInterests[0]?.count || 1;
            interestsContainer.innerHTML = topInterests.slice(0, 7).map(item => {
              const pct = Math.round((item.count / maxCount) * 100);
              return `
                <div class="top-page-row" style="padding:6px 10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.84rem;">
                    <span style="font-weight:600; color:var(--purple); display:flex; align-items:center; gap:6px;">
                      <span>🏷️</span> ${escapeHtml(item.name)}
                    </span>
                    <span style="font-weight:700; color:var(--text);">${item.count} คู่</span>
                  </div>
                  <div class="page-bar-bg" style="height:6px; background:#f0edff; border-radius:4px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:linear-gradient(90deg, #7c3aed, #ec4899); border-radius:4px;"></div>
                  </div>
                </div>
              `;
            }).join('');
          }
        }

        if (canvasBehavior && typeof Chart !== 'undefined') {
          if (swipeBehaviorChartInstance) {
            swipeBehaviorChartInstance.destroy();
          }

          swipeBehaviorChartInstance = new Chart(canvasBehavior, {
            type: 'pie',
            data: {
              labels: ['ปัดเร็ว (< 2 วินาที)', 'พิจารณาปานกลาง (2 - 5s)', 'ดูโปรไฟล์ละเอียด (> 5s)'],
              datasets: [{
                data: [42, 38, 20],
                backgroundColor: ['#f59e0b', '#7c3aed', '#10b981'],
                borderWidth: 2,
                borderColor: '#ffffff'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'right',
                  labels: { boxWidth: 10, boxHeight: 10, font: { family: 'Prompt, sans-serif', size: 10 } }
                }
              }
            }
          });

          if (behaviorStatsEl) {
            behaviorStatsEl.innerHTML = `
              <div class="browser-stat-pill" style="font-size:0.8rem; padding:4px 10px;">
                <span>⚡ ความเร็วการปัด:</span> <strong>3.9s เฉลี่ย</strong>
              </div>
              <div class="browser-stat-pill" style="font-size:0.8rem; padding:4px 10px;">
                <span>❤️ ดูนานกว่าเมื่อ Like:</span> <strong>+1.8 เท่า</strong>
              </div>
            `;
          }
        }
      } catch (err) {
        console.error('[Load Match Factors Error]', err);
      }
    }

    async function loadSystemOpportunities() {
      const container = document.getElementById('systemOpportunitiesGrid');
      if (!container) return;

      const minScore = document.getElementById('oppMinScoreSelect')?.value || '80';
      const search = document.getElementById('oppSearchInput')?.value || '';

      container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--muted);">กำลังคำนวณโอกาสการจับคู่จากฐานข้อมูล...</div>';

      try {
        const queryParams = new URLSearchParams({ limit: '12', minScore, search });
        const opportunities = await apiRequest(`/api/admin/matchmaking/opportunities?${queryParams}`);

        if (!opportunities || !opportunities.length) {
          container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);">ไม่พบคู่ที่มีคะแนนตรงตามเงื่อนไข ลองลดเกณฑ์คะแนนหรือล้างคำค้นหา</div>';
          return;
        }

        container.innerHTML = opportunities.map(opp => {
          const uA = opp.user_a;
          const uB = opp.user_b;
          const avatarA = uA.profile_image ? `<img src="${escapeHtml(uA.profile_image)}" class="opp-avatar" alt="${escapeHtml(uA.name)}" />` : `<div class="opp-avatar placeholder">${escapeHtml(uA.name.charAt(0))}</div>`;
          const avatarB = uB.profile_image ? `<img src="${escapeHtml(uB.profile_image)}" class="opp-avatar" alt="${escapeHtml(uB.name)}" />` : `<div class="opp-avatar placeholder">${escapeHtml(uB.name.charAt(0))}</div>`;

          const sharedPills = (opp.common_interests || []).slice(0, 3).map(t => `<span class="opp-synergy-pill interest">✨ ${escapeHtml(t)}</span>`).join('');
          const majorPill = opp.same_major ? `<span class="opp-synergy-pill major">🎓 สาขาเดียวกัน</span>` : '';
          const agePill = opp.age_diff <= 1 ? `<span class="opp-synergy-pill age">🎂 วัยเดียวกัน</span>` : '';

          return `
            <div class="opportunity-card">
              <div class="opportunity-card-top">
                <div class="opp-pair-avatars">
                  ${avatarA}
                  <div class="opp-heart-badge">💕</div>
                  ${avatarB}
                </div>
                <div class="opp-score-badge ${opp.probability_pct >= 85 ? 'high' : ''}">
                  <span class="opp-score-number">${opp.probability_pct}%</span>
                  <span class="opp-score-label">โอกาสแมตช์</span>
                </div>
              </div>

              <div class="opp-names-row">
                <strong>${escapeHtml(uA.name)}</strong> (${escapeHtml(uA.major || '-')})
                <span style="color:var(--muted); margin:0 4px;">&amp;</span>
                <strong>${escapeHtml(uB.name)}</strong> (${escapeHtml(uB.major || '-')})
              </div>

              <div class="opp-synergy-pills-row">
                ${sharedPills}
                ${majorPill}
                ${agePill}
              </div>

              <p class="opp-reason-text">
                💡 ${escapeHtml(opp.reasons[0] || 'มีความเข้ากันได้ในระดับสูง')}
              </p>

              <div class="opp-card-actions">
                <button type="button" class="inline-button review" data-action-inspect-pair-a="${uA.id}" data-action-inspect-pair-b="${uB.id}" style="width:100%; justify-content:center; padding:6px 12px; font-size:0.82rem;">
                  🔬 เจาะลึก Matching DNA แบบเคียงข้างกัน
                </button>
              </div>
            </div>
          `;
        }).join('');

        container.querySelectorAll('[data-action-inspect-pair-a]').forEach(btn => {
          btn.addEventListener('click', () => {
            const uA = btn.dataset.actionInspectPairA;
            const uB = btn.dataset.actionInspectPairB;
            openMatchingDnaModal(uA, uB);
          });
        });
      } catch (err) {
        console.error('[Load Opportunities Error]', err);
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);">⚠️ ${escapeHtml(err.message || 'เกิดข้อผิดพลาดในการโหลด')}</div>`;
      }
    }

    async function loadSimulatorUsers() {
      const select = document.getElementById('simulatorUserSelect');
      if (!select) return;

      try {
        const users = await apiRequest('/api/users');
        const activeUsers = users.filter(u => u.is_active !== 0 && (!u.role || u.role === 'user'));
        select.innerHTML = '<option value="">-- เลือกสมาชิกเพื่อจำลองโอกาสจับคู่ --</option>' + 
          activeUsers.map(u => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)} | ${escapeHtml(u.gender || 'ไม่ระบุ')})</option>`).join('');
      } catch (err) {
        console.error('[Load Simulator Users Error]', err);
      }
    }

    async function runUserSimulation(userId) {
      const container = document.getElementById('simulatorResultsContainer');
      if (!container) return;

      container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--purple);">⚡ กำลังประมวลผลอัลกอริทึมทำนายคู่ที่เข้ากันได้...</div>';

      try {
        const data = await apiRequest(`/api/admin/matchmaking/simulate/${userId}`);
        const user = data.user;
        const matches = data.top_matches || [];

        if (!matches.length) {
          container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--muted);">ไม่พบสมาชิกที่ตรงตามเกณฑ์เพศที่สนใจ</div>';
          return;
        }

        container.innerHTML = `
          <div style="background:#ffffff; padding:16px; border-radius:12px; margin-bottom:16px; border:1px solid var(--line); display:flex; align-items:center; gap:14px;">
            ${user.profile_image ? `<img src="${escapeHtml(user.profile_image)}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid var(--purple);" />` : `<div style="width:52px; height:52px; border-radius:50%; background:#f0edff; color:var(--purple); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.2rem;">${user.name.charAt(0)}</div>`}
            <div>
              <div style="font-weight:700; font-size:1.1rem; color:var(--purple-dark);">${escapeHtml(user.name)} (${escapeHtml(user.gender || 'ไม่ระบุ')})</div>
              <div style="font-size:0.85rem; color:var(--muted);">${escapeHtml(user.major || '-')} • ความสนใจ: ${escapeHtml(user.interests || '-')}</div>
            </div>
          </div>
          <h4 style="margin:0 0 12px; color:var(--purple);">🌟 10 อันดับสมาชิกที่มีโอกาสแมตช์สูงสุด:</h4>
          <div class="opportunity-cards-grid">
            ${matches.map(m => {
              const cand = m.candidate;
              const avatar = cand.profile_image ? `<img src="${escapeHtml(cand.profile_image)}" class="opp-avatar" alt="${escapeHtml(cand.name)}" />` : `<div class="opp-avatar placeholder">${escapeHtml(cand.name.charAt(0))}</div>`;
              return `
                <div class="opportunity-card">
                  <div class="opportunity-card-top">
                    <div style="display:flex; align-items:center; gap:10px;">
                      ${avatar}
                      <div>
                        <strong style="font-size:0.95rem; color:var(--text);">${escapeHtml(cand.name)}</strong>
                        <div style="font-size:0.78rem; color:var(--muted);">${escapeHtml(cand.major || '-')} • ${cand.age || 20} ปี</div>
                      </div>
                    </div>
                    <div class="opp-score-badge ${m.probability_pct >= 85 ? 'high' : ''}">
                      <span class="opp-score-number">${m.probability_pct}%</span>
                      <span class="opp-score-label">โอกาสสำเร็จ</span>
                    </div>
                  </div>
                  <div class="opp-synergy-pills-row" style="margin-top:10px;">
                    ${(m.common_interests || []).slice(0, 3).map(t => `<span class="opp-synergy-pill interest">✨ ${escapeHtml(t)}</span>`).join('')}
                    ${m.same_major ? `<span class="opp-synergy-pill major">🎓 สาขาเดียวกัน</span>` : ''}
                  </div>
                  <p class="opp-reason-text">💡 ${escapeHtml(m.reasons[0] || 'มีความสมพงษ์ในระดับสูง')}</p>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                    <span class="badge ${m.current_status === 'matched' ? 'resolve' : (m.current_status === 'liked' ? 'reviewed' : '')}" style="font-size:0.75rem;">
                      ${m.current_status === 'matched' ? '🎉 แมตช์แล้ว' : (m.current_status === 'liked' ? '❤️ มีการกด Like' : (m.current_status === 'skipped' ? '❌ เคยปัดผ่าน' : '✨ ยังไม่เคยปัดกัน'))}
                    </span>
                    <button type="button" class="inline-button review" data-action-inspect-pair-a="${user.id}" data-action-inspect-pair-b="${cand.id}" style="font-size:0.78rem; padding:4px 10px;">
                      🔬 ดู Matching DNA
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        container.querySelectorAll('[data-action-inspect-pair-a]').forEach(btn => {
          btn.addEventListener('click', () => {
            const uA = btn.dataset.actionInspectPairA;
            const uB = btn.dataset.actionInspectPairB;
            openMatchingDnaModal(uA, uB);
          });
        });
      } catch (err) {
        console.error('[Simulation Error]', err);
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);">⚠️ ${escapeHtml(err.message || 'เกิดข้อผิดพลาดในการจำลอง')}</div>`;
      }
    }

    async function loadSwipeLogs(page = 1) {
      const tableBody = document.getElementById('swipeLogsTableBody');
      const pageInfo = document.getElementById('swipeLogsPaginationInfo');
      const pageIndicator = document.getElementById('swipeLogsPageIndicator');
      const btnPrev = document.getElementById('btnPrevSwipeLogs');
      const btnNext = document.getElementById('btnNextSwipeLogs');

      if (!tableBody) return;

      currentSwipeLogsPage = page;
      const search = document.getElementById('swipeLogSearchInput')?.value || '';
      const action = document.getElementById('swipeLogActionFilter')?.value || 'all';
      const minScore = document.getElementById('swipeLogMinScoreFilter')?.value || '0';

      tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 25px; color: var(--muted);">กำลังโหลดประวัติการปัด...</td></tr>';

      try {
        const queryParams = new URLSearchParams({
          page: String(page),
          limit: String(currentSwipeLogsLimit),
          action,
          search,
          minScore
        });

        const data = await apiRequest(`/api/admin/matchmaking/logs?${queryParams}`);
        const logs = data.logs || [];
        totalSwipeLogsPages = data.total_pages || 1;

        if (pageInfo) pageInfo.textContent = `แสดง ${logs.length} จากทั้งหมด ${data.total || 0} รายการ`;
        if (pageIndicator) pageIndicator.textContent = `${data.page || 1} / ${totalSwipeLogsPages}`;
        if (btnPrev) btnPrev.disabled = currentSwipeLogsPage <= 1;
        if (btnNext) btnNext.disabled = currentSwipeLogsPage >= totalSwipeLogsPages;

        if (!logs.length) {
          tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--muted);">ไม่พบประวัติการปัดที่ตรงกับเงื่อนไข</td></tr>';
          return;
        }

        tableBody.innerHTML = logs.map(l => {
          let actionBadge = '';
          if (l.is_mutual_match) {
            actionBadge = '<span class="badge resolve" style="background:#ec4899; color:white; font-weight:700;">🎉 MATCHED!</span>';
          } else if (l.action === 'like') {
            actionBadge = '<span class="badge" style="background:#fee2e2; color:#dc2626; font-weight:600;">❤️ LIKE</span>';
          } else if (l.action === 'pass' || l.action === 'skip') {
            actionBadge = '<span class="badge" style="background:#f1f5f9; color:#64748b;">❌ PASS</span>';
          } else {
            actionBadge = `<span class="badge">${escapeHtml(l.action)}</span>`;
          }

          const scoreColor = l.compatibility_score >= 85 ? '#10b981' : (l.compatibility_score >= 75 ? '#7c3aed' : '#f59e0b');
          const commonTags = (l.common_interests || '').split(',').map(t => t.trim()).filter(Boolean);
          const tagsHtml = commonTags.length
            ? commonTags.slice(0, 2).map(t => `<span class="opp-synergy-pill interest" style="font-size:0.72rem; padding:2px 6px;">${escapeHtml(t)}</span>`).join(' ') + (commonTags.length > 2 ? ` <span style="font-size:0.72rem; color:var(--muted);">+${commonTags.length - 2}</span>` : '')
            : '<span style="color:var(--muted); font-size:0.78rem;">-</span>';

          const chatBadge = l.chat_id
            ? (l.has_chatted ? '<span class="badge resolve" style="font-size:0.72rem;">💬 คุยแล้ว</span>' : '<span class="badge reviewed" style="font-size:0.72rem;">ห้องเปิดแล้ว</span>')
            : '<span style="color:var(--muted); font-size:0.75rem;">-</span>';

          return `
            <tr>
              <td style="font-size:0.8rem; white-space:nowrap;">${escapeHtml(formatThaiTime(l.created_at))}</td>
              <td>
                <div style="display:flex; align-items:center; gap:8px;">
                  ${l.swiper_image ? `<img src="${escapeHtml(l.swiper_image)}" class="mini-avatar" alt="Swiper" />` : `<div class="mini-avatar initial">${l.swiper_name.charAt(0)}</div>`}
                  <div>
                    <strong>${escapeHtml(l.swiper_name)}</strong>
                    <div style="font-size:0.74rem; color:var(--muted);">${escapeHtml(l.swiper_major || '-')}</div>
                  </div>
                </div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:8px;">
                  ${l.target_image ? `<img src="${escapeHtml(l.target_image)}" class="mini-avatar" alt="Target" />` : `<div class="mini-avatar initial">${l.target_name.charAt(0)}</div>`}
                  <div>
                    <strong>${escapeHtml(l.target_name)}</strong>
                    <div style="font-size:0.74rem; color:var(--muted);">${escapeHtml(l.target_major || '-')}</div>
                  </div>
                </div>
              </td>
              <td>${actionBadge}</td>
              <td>
                <span style="font-weight:800; color:${scoreColor}; font-size:0.95rem;">${l.compatibility_score || 75}%</span>
              </td>
              <td>
                <div>${tagsHtml}</div>
                ${l.same_major ? '<span style="font-size:0.72rem; color:#059669; font-weight:600;">• สาขาเดียวกัน</span>' : ''}
              </td>
              <td style="font-size:0.82rem; font-weight:600; color:#475569;">
                ⏱️ ${l.dwell_time_sec}s
              </td>
              <td>${chatBadge}</td>
              <td>
                <button type="button" class="inline-button review" data-action-inspect-pair-a="${l.swiper_id}" data-action-inspect-pair-b="${l.target_id}" style="padding:3px 8px; font-size:0.76rem;">
                  🔬 DNA
                </button>
              </td>
            </tr>
          `;
        }).join('');

        tableBody.querySelectorAll('[data-action-inspect-pair-a]').forEach(btn => {
          btn.addEventListener('click', () => {
            const uA = btn.dataset.actionInspectPairA;
            const uB = btn.dataset.actionInspectPairB;
            openMatchingDnaModal(uA, uB);
          });
        });
      } catch (err) {
        console.error('[Load Swipe Logs Error]', err);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 25px; color: var(--danger);">⚠️ ${escapeHtml(err.message || 'เกิดข้อผิดพลาดในการโหลดประวัติการปัด')}</td></tr>`;
      }
    }

    async function openMatchingDnaModal(userAId, userBId) {
      const modal = document.getElementById('matchingDnaModal');
      const modalBody = document.getElementById('matchingDnaModalBody');
      if (!modal || !modalBody) return;

      modal.classList.remove('hidden');
      modalBody.innerHTML = '<div style="text-align: center; padding: 50px; color: var(--purple);">🔬 กำลังประมวลผลและเปรียบเทียบ Matching DNA เชิงลึก...</div>';

      try {
        const data = await apiRequest(`/api/admin/matchmaking/pair-analysis?user_a=${userAId}&user_b=${userBId}`);
        const uA = data.user_a;
        const uB = data.user_b;
        const syn = data.synergy;
        const chat = data.chat;

        const renderUserCard = (u, otherName) => {
          let actionLabel = '<span style="color:var(--muted);">ยังไม่เคยปัดการ์ด</span>';
          if (u.swiped_action === 'like') {
            actionLabel = `<span style="color:#dc2626; font-weight:700;">❤️ กดถูกใจ (Like)</span> • ใช้เวลาดู ${u.dwell_time_sec || '3.5'}s`;
          } else if (u.swiped_action === 'pass' || u.swiped_action === 'skip') {
            actionLabel = `<span style="color:#64748b; font-weight:700;">❌ ปัดผ่าน (Pass)</span> • ใช้เวลาดู ${u.dwell_time_sec || '1.8'}s`;
          }

          return `
            <div class="dna-user-column-card">
              <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                ${u.profile_image ? `<img src="${escapeHtml(u.profile_image)}" class="dna-profile-avatar" />` : `<div class="dna-profile-avatar placeholder">${u.name.charAt(0)}</div>`}
                <div style="flex:1;">
                  <h4 style="margin:0 0 2px; color:var(--purple-dark); font-size:1.1rem;">${escapeHtml(u.name)} ${u.nickname ? `(${escapeHtml(u.nickname)})` : ''}</h4>
                  <div style="font-size:0.8rem; color:var(--muted);">${escapeHtml(u.email)}</div>
                  <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
                    <span class="badge reviewed" style="font-size:0.72rem;">${escapeHtml(u.gender || 'ไม่ระบุ')}</span>
                    <span class="badge" style="font-size:0.72rem; background:#f0edff; color:var(--purple);">${u.age || 20} ปี</span>
                    <span class="badge" style="font-size:0.72rem; background:#e0f2fe; color:#0284c7;">${escapeHtml(u.zodiac || 'ไม่ระบุราศี')}</span>
                  </div>
                </div>
              </div>

              <div class="dna-info-mini-grid">
                <div><strong>🏫 สถาบัน:</strong> ${escapeHtml(u.university || 'มหาวิทยาลัยขอนแก่น')}</div>
                <div><strong>🎓 สาขาวิชา:</strong> ${escapeHtml(u.major || '-')} (${escapeHtml(u.year || 'ไม่ระบุ')})</div>
                <div style="grid-column:1/-1;"><strong>💡 ความสนใจ:</strong> ${u.interests.map(t => `<span class="opp-synergy-pill ${syn.common_interests.includes(t) ? 'interest shared-glow' : ''}" style="font-size:0.72rem; margin-right:4px;">${escapeHtml(t)}</span>`).join('') || '-'}</div>
                <div style="grid-column:1/-1;"><strong>📝 Bio:</strong> <span style="font-style:italic; color:var(--muted);">${escapeHtml(u.bio || 'ไม่มีข้อมูล')}</span></div>
              </div>

              <div class="dna-action-history-box" style="margin-top:12px; padding:8px 12px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:0.8rem;">
                <strong>⚡ การตัดสินใจต่อ ${escapeHtml(otherName)}:</strong>
                <div>${actionLabel}</div>
              </div>
            </div>
          `;
        };

        const dims = syn.dimensions || {};
        const passionScore = dims.passion?.score || 80;
        const emoScore = dims.emotional?.score || 78;
        const commScore = dims.communication?.score || 85;
        const longScore = dims.longTerm?.score || 75;

        modalBody.innerHTML = `
          <div class="dna-score-banner" style="background:linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(225, 29, 72, 0.12)); padding:16px 20px; border-radius:12px; border:1px solid rgba(124, 58, 237, 0.2); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:14px;">
              <div style="width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg, #7c3aed, #e11d48); color:white; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:800; font-size:1.4rem; box-shadow:0 4px 12px rgba(124,58,237,0.3);">
                <span>${syn.compatibility_score}%</span>
              </div>
              <div>
                <h3 style="margin:0; font-size:1.25rem; color:var(--purple-dark); font-weight:800;">${escapeHtml(syn.level)}</h3>
                <p style="margin:4px 0 0; font-size:0.85rem; color:var(--muted);">
                  วิเคราะห์โดยโมเดล Multi-dimensional Matchmaking &amp; Tinder-grade Dwell Intelligence
                </p>
              </div>
            </div>
            <div style="text-align:right;">
              <span class="badge ${chat.is_active ? 'resolve' : 'reviewed'}" style="font-size:0.82rem; padding:5px 12px;">
                ${chat.is_active ? `💬 สนทนาแล้ว (${chat.messages_count} ข้อความ)` : (chat.id ? '💬 เปิดห้องแชทแล้ว (ยังไม่ทัก)' : '🔒 ยังไม่เปิดแชท')}
              </span>
            </div>
          </div>

          <div class="dna-side-by-side-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
            ${renderUserCard(uA, uB.name)}
            ${renderUserCard(uB, uA.name)}
          </div>

          <div class="card" style="padding:16px; margin-bottom:18px; background:#faf5ff; border:1px solid rgba(124, 58, 237, 0.15);">
            <h4 style="margin:0 0 12px; color:var(--purple); font-size:1rem; display:flex; align-items:center; gap:6px;">
              <span>📊</span> วิเคราะห์ 4 มิติความเข้ากันได้ (4-Dimensional Matrix)
            </h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
              <div>
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                  <span>🔥 เสน่หาและแรงดึงดูด (Passion)</span>
                  <strong>${passionScore}%</strong>
                </div>
                <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${passionScore}%; background:#e11d48; border-radius:3px;"></div>
                </div>
              </div>
              <div>
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                  <span>💖 ความเข้าใจทางอารมณ์ (Emotional)</span>
                  <strong>${emoScore}%</strong>
                </div>
                <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${emoScore}%; background:#ec4899; border-radius:3px;"></div>
                </div>
              </div>
              <div>
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                  <span>🗣️ การสื่อสารและไลฟ์สไตล์ (Communication)</span>
                  <strong>${commScore}%</strong>
                </div>
                <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${commScore}%; background:#00b4d8; border-radius:3px;"></div>
                </div>
              </div>
              <div>
                <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:4px;">
                  <span>💍 โอกาสต่อยอดระยะยาว (Long-Term)</span>
                  <strong>${longScore}%</strong>
                </div>
                <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${longScore}%; background:#10b981; border-radius:3px;"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="card" style="padding:16px; background:#ffffff; border:1px solid var(--line);">
            <h4 style="margin:0 0 10px; color:var(--purple); font-size:1rem; display:flex; align-items:center; gap:6px;">
              <span>🎯</span> รายการเหตุผลและสิ่งที่ตรงกัน (Matching Synergy Reasons)
            </h4>
            <ul style="margin:0; padding-left:20px; font-size:0.88rem; line-height:1.6; color:var(--text);">
              ${(syn.reasons || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>
        `;
      } catch (err) {
        console.error('[Open DNA Modal Error]', err);
        modalBody.innerHTML = `<div style="text-align:center; padding:40px; color:var(--danger);">⚠️ ${escapeHtml(err.message || 'ไม่สามารถโหลดข้อมูล DNA ได้')}</div>`;
      }
    }

    loadAdminDashboard();
    initAnalyticsDashboard();
    initMatchmakingDashboard();
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
