/* ============================================================
   CWIE PSU Surat Thani — Dashboard logic  v2.1 (Patched)
   ------------------------------------------------------------
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────
let allJobs      = [];
let filteredJobs = [];
let currentPage  = 1;
const itemsPerPage = 10;
let locationChartInstance = null;
let statusChartInstance   = null;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                const btnAdmin = document.getElementById('btn-admin-link');
                if (btnAdmin) btnAdmin.style.display = 'inline-flex';
            }
        } catch (err) { console.warn('[CWIE] getSession:', err); }
    }

    document.getElementById('secret-admin-trigger')
        ?.addEventListener('dblclick', () => { window.location.href = 'admin.html'; });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeJobDetailModal();
    });

    await fetchDashboardJobs();
    setupRealtimeSubscription();
});

// ─── Realtime ─────────────────────────────────────────────────

const _debouncedFetch = debounce(fetchDashboardJobs, 800);

function setupRealtimeSubscription() {
    if (typeof supabaseClient === 'undefined') return;
    supabaseClient
        .channel('public:cwie_jobs')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'cwie_jobs' },
            _debouncedFetch)
        .subscribe();
}

// ─── Data Fetching ────────────────────────────────────────────
async function fetchDashboardJobs() {
    const tbody = document.getElementById('job-list-body');
    if (tbody) tbody.innerHTML = skeletonRowsHtml(7, 5);

    try {
        const { data, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        allJobs = data ?? [];

        const prevPage = currentPage;
        _applyCurrentFilter();
        const newTotalPages = Math.ceil(filteredJobs.length / itemsPerPage) || 1;
        currentPage = Math.min(prevPage, newTotalPages);

        updateDashboardStats(allJobs);
        populateLocationFilter(allJobs);
        renderCharts(allJobs);
        renderPaginatedTable();
    } catch (err) {
        console.error('[CWIE] fetchDashboardJobs:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-rose-500 font-semibold">
                เกิดข้อผิดพลาด: ${escapeHtml(err.message)}
            </td></tr>`;
        }
    }
}

// ─── Stats ────────────────────────────────────────────────────
function updateDashboardStats(jobs) {
    const total = jobs.length;
    let openCount = 0, closedCount = 0;
    jobs.forEach(job => {
        if (isJobClosed(job.status)) closedCount++; else openCount++;
    });
    document.getElementById('dash-stat-total').innerText  = total.toLocaleString();
    document.getElementById('dash-stat-open').innerText   = openCount.toLocaleString();
    document.getElementById('dash-stat-closed').innerText = closedCount.toLocaleString();
}

// ─── Charts ───────────────────────────────────────────────────
function renderCharts(jobs) {
    const locationCounts = {};
    let openCount = 0, closedCount = 0;
    jobs.forEach(job => {
        const loc = (job.location && job.location !== '-') ? job.location.trim() : 'ไม่ระบุ';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
        if (isJobClosed(job.status)) closedCount++; else openCount++;
    });

    const ctxLoc = document.getElementById('chart-location');
    if (ctxLoc) {
        if (locationChartInstance) locationChartInstance.destroy();
        locationChartInstance = new Chart(ctxLoc, {
            type: 'bar',
            data: {
                labels: Object.keys(locationCounts),
                datasets: [{
                    data: Object.values(locationCounts),
                    backgroundColor: 'rgba(0, 119, 182, 0.75)',
                    borderColor: '#003566',
                    borderWidth: 1.5,
                    borderRadius: 8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
            },
        });
    }

    const ctxStatus = document.getElementById('chart-status');
    if (ctxStatus) {
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['เปิดรับสมัครอยู่', 'ปิดรับสมัครแล้ว'],
                datasets: [{
                    data: [openCount, closedCount],
                    backgroundColor: ['#10b981', '#f43f5e'],
                    borderWidth: 2,
                    borderColor: '#fff',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
            },
        });
    }
}

// ─── Location Filter ──────────────────────────────────────────
function populateLocationFilter(jobs) {
    const filterSelect = document.getElementById('location-filter');
    if (!filterSelect) return;

    // ✅ จำค่าที่ผู้ใช้เลือกไว้ก่อนล้างสร้างใหม่
    const currentSelectedValue = filterSelect.value;

    const fragment   = document.createDocumentFragment();
    const defaultOpt = document.createElement('option');
    defaultOpt.value       = '';
    defaultOpt.textContent = 'ทุกสถานที่ปฏิบัติงาน';
    fragment.appendChild(defaultOpt);

    const locations = new Set(
        jobs.map(j => j.location?.trim()).filter(loc => loc && loc !== '-')
    );
    locations.forEach(loc => {
        const opt       = document.createElement('option');
        opt.value       = loc;
        opt.textContent = loc;
        fragment.appendChild(opt);
    });

    filterSelect.replaceChildren(fragment);

    // ✅ คืนค่าที่ผู้ใช้เคยเลือก (ถ้าไม่มีในรายการใหม่จะกลับไปที่ค่า default)
    if (currentSelectedValue) {
        filterSelect.value = currentSelectedValue;
    }
}

// ─── Filter Logic ─────────────────────────────────────────────
function _applyCurrentFilter() {
    const searchVal   = document.getElementById('search-input')?.value.toLowerCase().trim() ?? '';
    const locationVal = _decodeHtmlEntities(
        document.getElementById('location-filter')?.value ?? ''
    );

    filteredJobs = allJobs.filter(job => {
        const matchSearch = [job.company_name, job.position_title, job.location]
            .some(field => (field ?? '').toLowerCase().includes(searchVal));
        const matchLocation = !locationVal
            || (job.location ?? '').trim() === locationVal;
        return matchSearch && matchLocation;
    });
}

function _decodeHtmlEntities(str) {
    const txt   = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
}

const filterJobs = debounce(() => {
    _applyCurrentFilter();
    currentPage = 1;
    renderPaginatedTable();
}, 200);

// ─── Table Render ─────────────────────────────────────────────
function renderPaginatedTable() {
    const tbody        = document.getElementById('job-list-body');
    const infoEl       = document.getElementById('pagination-info');
    const btnContainer = document.getElementById('pagination-buttons');
    if (!tbody) return;

    const totalItems = filteredJobs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const startIndex   = (currentPage - 1) * itemsPerPage;
    const endIndex     = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedData = filteredJobs.slice(startIndex, endIndex);

    if (infoEl) {
        infoEl.innerText = `แสดง ${totalItems === 0 ? 0 : startIndex + 1} - ${endIndex} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`;
    }

    if (paginatedData.length === 0) {
        tbody.innerHTML = emptyRowHtml(7, 'ไม่พบรายการประกาศงานที่ตรงกับเงื่อนไข');
    } else {
        tbody.innerHTML = '';
        paginatedData.forEach(job => {
            const avatar      = getCompanyAvatar(job.company_name);
            const jobTypeBadge = `<span class="badge-count">${escapeHtml(job.job_type) || 'สหกิจศึกษา'}</span>`;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/80 transition-colors cursor-pointer';
            tr.addEventListener('click', () => openJobDetailModal(job));
            tr.innerHTML = `
                <td class="p-4">
                    <div class="flex items-center gap-2.5">
                        <div class="company-avatar" style="background:${avatar.color};">${escapeHtml(avatar.initial)}</div>
                        <span class="font-semibold text-slate-800">${escapeHtml(job.company_name) || '-'}</span>
                    </div>
                </td>
                <td class="p-4 font-medium text-psublue">${escapeHtml(job.position_title) || '-'}</td>
                <td class="p-4">${jobTypeBadge}</td>
                <td class="p-4 text-slate-600">${escapeHtml(job.location) || '-'}</td>
                <td class="p-4 font-semibold text-emerald-600">${escapeHtml(job.salary) || 'ไม่ระบุ'}</td>
                <td class="p-4">${statusPillHtml(job.status)}</td>
                <td class="p-4 text-center">
                    <button class="px-3 py-1 bg-slate-100 text-psublue rounded-lg text-xs font-medium hover:bg-psublue hover:text-white transition-all font-heading">
                        ดูข้อมูล
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderPagination(btnContainer, {
        currentPage,
        totalPages,
        onChange: (p) => { currentPage = p; renderPaginatedTable(); },
    });
}

// ─── Job Detail Modal ─────────────────────────────────────────
function openJobDetailModal(job) {
    const modal = document.getElementById('job-detail-modal');
    if (!modal) return;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text ?? '-';
    };

    setText('modal-company-name',   job.company_name);
    setText('modal-position-title', job.position_title);
    setText('modal-location',       job.location);
    setText('modal-work-format',    job.work_format    ?? 'ไม่ระบุ');
    setText('modal-salary',         job.salary         ?? 'ไม่ระบุ');
    setText('modal-quota',          job.quota          ?? 'ไม่ระบุ');
    setText('modal-deadline',       job.deadline       ?? 'ไม่ระบุ');
    setText('modal-contact',        job.contact_info   ?? job.application_channel ?? '-');

    const avatarEl = document.getElementById('modal-avatar');
    if (avatarEl) {
        const avatar          = getCompanyAvatar(job.company_name);
        avatarEl.textContent  = avatar.initial;
        avatarEl.style.background = avatar.color;
    }

    const closed      = isJobClosed(job.status);
    const statusBadge = document.getElementById('modal-badge-status');
    if (statusBadge) {
        statusBadge.innerHTML = `<span class="dot" style="background:${closed ? '#fb7185' : '#34d399'};"></span>${closed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่'}`;
    }

    const applyBtn = document.getElementById('modal-apply-btn');
    if (applyBtn) {
        const safeUrl = sanitizeUrl(job.application_channel ?? job.contact_info);
        if (safeUrl) {
            applyBtn.href          = safeUrl;
            applyBtn.rel           = 'noopener noreferrer';
            applyBtn.style.display = 'inline-flex';
        } else {
            applyBtn.style.display = 'none';
        }
    }

    modal.classList.remove('hidden');
    modal.querySelector('[autofocus], button, [href], input')?.focus();
}

function closeJobDetailModal() {
    document.getElementById('job-detail-modal')?.classList.add('hidden');
}
