/* ============================================================
   CWIE PSU Surat Thani — Admin panel logic (admin.js) v2.2 (Auto-Detect Columns)
   ต้องโหลดหลัง shared-utils.js เสมอ
   ============================================================ */

let globalJobsList = [];
let currentJobsFiltered = [];
let currentJobsPage = 1;
const CURRENT_JOBS_PAGE_SIZE = 8;

const ROW_ICONS = {
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAdminJobModal();
    });
});

async function checkAuthSession() {
    const loginModal = document.getElementById('login-modal');
    const panel = document.getElementById('admin-panel-container');
    const btnLogout = document.getElementById('btn-logout');

    if (typeof supabaseClient === 'undefined') {
        if (loginModal) loginModal.style.display = 'flex';
        if (panel) panel.style.display = 'none';
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            if (loginModal) loginModal.style.display = 'none';
            if (panel) panel.style.display = 'block';
            if (btnLogout) btnLogout.style.display = 'inline-flex';

            fetchCurrentJobs();
            loadUploadHistory();
        } else {
            if (loginModal) loginModal.style.display = 'flex';
            if (panel) panel.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'none';
        }
    } catch (err) {
        console.warn("Auth Check Warning:", err);
        if (loginModal) loginModal.style.display = 'flex';
        if (panel) panel.style.display = 'none';
    }
}

async function loginAdmin() {
    if (typeof supabaseClient === 'undefined') return;
    const email = document.getElementById('admin-email')?.value.trim();
    const password = document.getElementById('admin-password')?.value.trim();
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        if (errorEl) {
            errorEl.innerText = 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน';
            errorEl.style.display = 'block';
        }
        return;
    }

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ!', timer: 1200, showConfirmButton: false });
        setTimeout(() => { location.reload(); }, 1200);
    } catch (err) {
        if (errorEl) {
            errorEl.innerText = err.message;
            errorEl.style.display = 'block';
        }
    }
}

async function logoutAdmin() {
    if (typeof supabaseClient !== 'undefined') {
        await supabaseClient.auth.signOut();
    }
    location.reload();
}

async function fetchCurrentJobs() {
    const tbody = document.getElementById('current-jobs-body');
    const totalCountEl = document.getElementById('stat-total-jobs');
    const lastUpdateEl = document.getElementById('stat-last-update');
    if (!tbody) return;

    tbody.innerHTML = skeletonRowsHtml(7, 4);

    try {
        if (typeof supabaseClient === 'undefined') {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-amber-600">ยังไม่ได้เชื่อมต่อ Supabase</td></tr>`;
            return;
        }

        const { data, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        globalJobsList = data || [];
        currentJobsFiltered = [...globalJobsList];
        currentJobsPage = 1;

        if (totalCountEl) totalCountEl.innerText = `${globalJobsList.length} รายการ`;
        if (globalJobsList.length > 0 && lastUpdateEl) {
            lastUpdateEl.innerText = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        renderCurrentJobsTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-rose-500">เกิดข้อผิดพลาด: ${escapeHtml(err.message)}</td></tr>`;
    }
}

const filterCurrentJobsTable = debounce(() => {
    const q = document.getElementById('current-jobs-search')?.value.toLowerCase().trim() || '';
    currentJobsFiltered = globalJobsList.filter(job =>
        (job.company_name || '').toLowerCase().includes(q) ||
        (job.position_title || '').toLowerCase().includes(q) ||
        (job.location || '').toLowerCase().includes(q)
    );
    currentJobsPage = 1;
    renderCurrentJobsTable();
}, 200);

function renderCurrentJobsTable() {
    const tbody = document.getElementById('current-jobs-body');
    const infoEl = document.getElementById('current-jobs-pagination-info');
    const pagerEl = document.getElementById('current-jobs-pagination');
    if (!tbody) return;

    if (globalJobsList.length === 0) {
        tbody.innerHTML = emptyRowHtml(7, 'ไม่พบข้อมูลในระบบ');
        if (infoEl) infoEl.innerText = '';
        if (pagerEl) pagerEl.innerHTML = '';
        return;
    }
    if (currentJobsFiltered.length === 0) {
        tbody.innerHTML = emptyRowHtml(7, 'ไม่พบรายการที่ตรงกับคำค้นหา');
        if (infoEl) infoEl.innerText = '';
        if (pagerEl) pagerEl.innerHTML = '';
        return;
    }

    const totalItems = currentJobsFiltered.length;
    const totalPages = Math.ceil(totalItems / CURRENT_JOBS_PAGE_SIZE) || 1;
    if (currentJobsPage > totalPages) currentJobsPage = totalPages;
    const start = (currentJobsPage - 1) * CURRENT_JOBS_PAGE_SIZE;
    const end = Math.min(start + CURRENT_JOBS_PAGE_SIZE, totalItems);
    const pageItems = currentJobsFiltered.slice(start, end);

    if (infoEl) infoEl.innerText = `แสดง ${start + 1} - ${end} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`;

    tbody.innerHTML = '';
    pageItems.forEach(job => {
        const avatar = getCompanyAvatar(job.company_name);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${escapeHtml(job.id)}</td>
            <td>
                <div class="company-cell">
                    <div class="company-avatar" style="width:28px;height:28px;font-size:11px;background:${avatar.color};">${escapeHtml(avatar.initial)}</div>
                    <b>${escapeHtml(job.company_name) || '-'}</b>
                </div>
            </td>
            <td style="color: var(--psu-deep); font-weight: 500;">${escapeHtml(job.position_title) || '-'}</td>
            <td>${escapeHtml(job.location) || '-'}</td>
            <td style="color: var(--status-open); font-weight: 600;">${escapeHtml(job.salary) || 'ไม่ระบุ'}</td>
            <td>${statusPillHtml(job.status)}</td>
            <td style="text-align: center; white-space: nowrap;">
                <button onclick="openEditJobModalById('${escapeHtml(job.id)}')" class="btn-edit-sm icon-btn">${ROW_ICONS.edit} แก้ไข</button>
                <button onclick="deleteJob('${escapeHtml(job.id)}')" class="btn-delete-sm icon-btn">${ROW_ICONS.trash} ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination(pagerEl, {
        currentPage: currentJobsPage,
        totalPages,
        onChange: (p) => { currentJobsPage = p; renderCurrentJobsTable(); }
    });
}

function exportCurrentJobsToExcel() {
    if (!globalJobsList.length) {
        Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'warning');
        return;
    }
    try {
        const rows = globalJobsList.map(job => ({
            'ID': job.id,
            'บริษัท/หน่วยงาน': job.company_name || '-',
            'ตำแหน่งงาน/ทุน': job.position_title || '-',
            'ประเภทงาน': job.job_type || '-',
            'สถานที่': job.location || '-',
            'รูปแบบงาน': job.work_format || '-',
            'เงินเดือน/เบี้ยเลี้ยง': job.salary || '-',
            'โควต้า': job.quota || '-',
            'วันปิดรับสมัคร': job.deadline || '-',
            'สถานะ': job.status || '-',
            'ช่องทางสมัคร/ติดต่อ': job.application_channel || job.contact_info || '-'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'CWIE Jobs');
        const dateTag = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `cwie-jobs-${dateTag}.xlsx`);
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ส่งออกได้: ' + err.message, 'error');
    }
}

function openAddJobModal() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('form-job-id', '');
    const titleEl = document.getElementById('form-modal-title');
    if (titleEl) titleEl.innerText = 'เพิ่มประกาศงานใหม่';

    setVal('form-company', '');
    setVal('form-position', '');
    setVal('form-location', '');
    setVal('form-work-format', 'Onsite');
    setVal('form-salary', '');
    setVal('form-quota', '');
    setVal('form-job-type', 'สหกิจศึกษา');
    setVal('form-status', 'เปิดรับสมัครอยู่');
    setVal('form-deadline', '');
    setVal('form-contact', '');

    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'flex';
    document.getElementById('form-company')?.focus();
}

function openEditJobModalById(id) {
    const job = globalJobsList.find(j => String(j.id) === String(id));
    if (!job) {
        console.warn('ไม่พบรายการงานที่มี id:', id);
        return;
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('form-job-id', job.id);
    const titleEl = document.getElementById('form-modal-title');
    if (titleEl) titleEl.innerText = 'แก้ไขประกาศงาน';

    setVal('form-company', job.company_name || '');
    setVal('form-position', job.position_title || '');
    setVal('form-location', job.location || '');
    setVal('form-work-format', job.work_format || 'Onsite');
    setVal('form-salary', job.salary || '');
    setVal('form-quota', job.quota || '');
    setVal('form-job-type', job.job_type || 'สหกิจศึกษา');
    setVal('form-status', job.status || 'เปิดรับสมัครอยู่');
    setVal('form-deadline', job.deadline && job.deadline !== 'ไม่ระบุ' ? job.deadline : '');
    setVal('form-contact', job.application_channel || job.contact_info || '');

    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAdminJobModal() {
    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'none';
}

async function getCurrentUserEmail() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user && session.user.email) {
            return session.user.email;
        }
    } catch (e) {
        console.warn("User Session Error:", e);
    }
    return 'Admin';
}

async function logHistoryEntry(filename, recordCount) {
    try {
        const currentUserEmail = await getCurrentUserEmail();
        const { error } = await supabaseClient.from('cwie_logs').insert([{
            filename,
            record_count: recordCount,
            uploaded_by: currentUserEmail,
            uploaded_at: new Date().toISOString()
        }]);
        if (error) {
            console.warn("Log Record Warning:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("Log Record Warning:", e.message);
        return false;
    }
}

async function saveJobManual() {
    const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

    const jobId = getVal('form-job-id');
    const company = getVal('form-company');
    const position = getVal('form-position');

    if (!company || !position) {
        Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อบริษัทและตำแหน่งงานให้ครบถ้วน', 'warning');
        return;
    }

    const contact = getVal('form-contact');
    if (contact && !/^https?:\/\//i.test(contact) && !contact.includes('@') && !/^[0-9+\-() ]{6,}$/.test(contact)) {
        const confirmResult = await Swal.fire({
            icon: 'question',
            title: 'ช่องติดต่อดูไม่เหมือนลิงก์ เบอร์โทร หรืออีเมล',
            text: 'ต้องการบันทึกข้อมูลนี้ต่อหรือไม่?',
            showCancelButton: true,
            confirmButtonText: 'บันทึกต่อ',
            cancelButtonText: 'กลับไปแก้ไข'
        });
        if (!confirmResult.isConfirmed) return;
    }

    const payload = {
        company_name: company,
        position_title: position,
        location: getVal('form-location') || '-',
        work_format: getVal('form-work-format') || 'Onsite',
        salary: getVal('form-salary') || 'ไม่ระบุ',
        quota: getVal('form-quota') || 'ไม่ระบุ',
        job_type: getVal('form-job-type') || 'สหกิจศึกษา',
        status: getVal('form-status') || 'เปิดรับสมัครอยู่',
        deadline: getVal('form-deadline') || 'ไม่ระบุ',
        application_channel: contact,
        contact_info: contact
    };

    try {
        let error;
        const isEdit = !!jobId;
        if (isEdit) {
            const res = await supabaseClient.from('cwie_jobs').update(payload).eq('id', jobId);
            error = res.error;
        } else {
            const res = await supabaseClient.from('cwie_jobs').insert([payload]);
            error = res.error;
        }

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', timer: 1200, showConfirmButton: false });
        closeAdminJobModal();
        fetchCurrentJobs();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function deleteJob(id) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'ต้องการลบประกาศงานนี้ออกจากระบบใช่หรือไม่',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#e11d48'
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabaseClient.from('cwie_jobs').delete().eq('id', id);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1000, showConfirmButton: false });
            fetchCurrentJobs();
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

async function deleteAllJobs() {
    const result = await Swal.fire({
        title: 'ล้างข้อมูลทั้งหมด?',
        html: 'ข้อมูลประกาศงานทั้งหมดจะถูกลบออกจากระบบอย่างถาวร!<br>พิมพ์ <b>ลบทั้งหมด</b> เพื่อยืนยัน',
        icon: 'warning',
        input: 'text',
        inputPlaceholder: 'พิมพ์ "ลบทั้งหมด" ที่นี่',
        showCancelButton: true,
        confirmButtonText: 'ล้างทั้งหมด',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc2626',
        preConfirm: (value) => {
            if (value !== 'ลบทั้งหมด') {
                Swal.showValidationMessage('กรุณาพิมพ์ข้อความให้ตรงกับที่กำหนดเพื่อยืนยัน');
                return false;
            }
            return true;
        }
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabaseClient.from('cwie_jobs').delete().not('id', 'is', null);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'ล้างข้อมูลสำเร็จ', timer: 1200, showConfirmButton: false });
            fetchCurrentJobs();
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

let parsedExcelData = [];
let uploadedFileName = '';
const IMPORT_CLOSED_KEYWORDS = [...(typeof CLOSED_STATUS_SET !== 'undefined' ? CLOSED_STATUS_SET : []), 'closed', 'close'];

function detectExcelColumns(headerRow) {
    const cols = {
        company_name: 1, position_title: 2, quota: 3, location: 4, 
        work_format: 5, salary: 6, deadline: 7, status: 8, 
        application_channel: 9, contact_info: 10
    };

    if (!headerRow || headerRow.length === 0) return cols;

    headerRow.forEach((rawName, index) => {
        const name = String(rawName || '').toLowerCase().replace(/\s+/g, '');
        
        if (name.includes('บริษัท') || name.includes('หน่วยงาน') || name.includes('ประกอบการ')) cols.company_name = index;
        else if (name.includes('ตำแหน่ง') || name.includes('ชื่องาน')) cols.position_title = index;
        else if (name.includes('จำนวน') || name.includes('อัตรา')) cols.quota = index;
        else if (name.includes('สถานที่') || name.includes('จังหวัด') || name.includes('ปฏิบัติงาน')) cols.location = index;
        else if (name.includes('รูปแบบ')) cols.work_format = index;
        else if (name.includes('เงินเดือน') || name.includes('เบี้ยเลี้ยง') || name.includes('ค่าตอบแทน') || name.includes('รายได้') || name.includes('ทุน')) cols.salary = index;
        else if (name.includes('ปิดรับ') || name.includes('กำหนด') || name.includes('วันที่')) cols.deadline = index;
        else if (name.includes('สถานะ')) cols.status = index;
        else if (name.includes('ช่องทาง') || name.includes('ลิงก์') || name.includes('สมัคร') || name.includes('ฟอร์ม')) cols.application_channel = index;
        else if (name.includes('ติดต่อ') || name.includes('เบอร์') || name.includes('โทร') || name.includes('อีเมล') || name.includes('email')) cols.contact_info = index;
    });

    return cols;
}

function normalizeStatusValue(raw) {
    const val = String(raw || '').trim();
    if (!val) return 'เปิดรับสมัครอยู่';
    const normalized = val.toLowerCase();
    
    if (normalized.includes('เปิด') || normalized.includes('open')) {
        return 'เปิดรับสมัครอยู่';
    }
    const isClosed = IMPORT_CLOSED_KEYWORDS.some(c => normalized.includes(c.toLowerCase()));
    return isClosed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่';
}

function pickBestSheet(workbook) {
    let bestName = workbook.SheetNames[0];
    let bestCount = -1;
    workbook.SheetNames.forEach(name => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
        if (rows.length > bestCount) {
            bestCount = rows.length;
            bestName = name;
        }
    });
    return bestName;
}

function formatThaiPhone(val) {
    if (!val || val === '-') return val;
    let str = String(val).trim();
    if (/^[1-9]\d{7,8}$/.test(str)) {
        return '0' + str;
    }
    return str;
}

async function handleFileUpload() {
    const fileInput = document.getElementById('excel-file');
    if (!fileInput.files || fileInput.files.length === 0) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ Excel (.xlsx หรือ .csv) ก่อน', 'warning');
        return;
    }
    const file = fileInput.files[0];
    uploadedFileName = file.name;
    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                Swal.fire('แจ้งเตือน', 'ไฟล์นี้ไม่มีแผ่นงาน (sheet) ที่อ่านได้', 'warning');
                return;
            }

            const sheetName = pickBestSheet(workbook);
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length < 2) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลในไฟล์ Excel หรือไฟล์ว่างเปล่า', 'warning');
                return;
            }

            const EXCEL_COLUMNS = detectExcelColumns(json[0]);

            const getCell = (row, idx, fallback) => {
                if (idx === undefined) return fallback;
                const val = row[idx];
                if (val === undefined || val === null || val === '') return fallback;
                
                if (val instanceof Date && !isNaN(val)) {
                    return val.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
                }
                if (typeof val === 'number') {
                    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
                }
                return String(val).trim();
            };

            parsedExcelData = [];
            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0) continue;

                const company = getCell(row, EXCEL_COLUMNS.company_name, '-');
                const position = getCell(row, EXCEL_COLUMNS.position_title, '-');
                if (company === '-' && position === '-') continue;

                parsedExcelData.push({
                    company_name: company,
                    position_title: position,
                    quota: getCell(row, EXCEL_COLUMNS.quota, 'ไม่ระบุ'),
                    location: getCell(row, EXCEL_COLUMNS.location, 'ไม่ระบุ'),
                    work_format: getCell(row, EXCEL_COLUMNS.work_format, 'Onsite'),
                    salary: getCell(row, EXCEL_COLUMNS.salary, 'ตามตกลง'),
                    deadline: getCell(row, EXCEL_COLUMNS.deadline, 'ไม่ระบุ'),
                    status: normalizeStatusValue(getCell(row, EXCEL_COLUMNS.status, '')),
                    application_channel: getCell(row, EXCEL_COLUMNS.application_channel, '-'),
                    contact_info: formatThaiPhone(getCell(row, EXCEL_COLUMNS.contact_info, '-')),
                    job_type: 'สหกิจศึกษา'
                });
            }

            if (parsedExcelData.length === 0) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลที่นำเข้าได้ในไฟล์นี้ กรุณาตรวจสอบว่าคอลัมน์บริษัท และตำแหน่ง มีข้อมูลอยู่', 'warning');
                return;
            }

            renderPreviewTable(parsedExcelData);
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message, 'error');
        }
    };
    reader.onerror = function () {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเปิดอ่านไฟล์นี้ได้ ไฟล์อาจเสียหายหรือถูกล็อกอยู่', 'error');
    };
    reader.readAsArrayBuffer(file);
}

function renderPreviewTable(data) {
    const section = document.getElementById('preview-section');
    const tbody = document.getElementById('preview-body');
    const badge = document.getElementById('preview-count-badge');
    if (!section || !tbody) return;

    section.style.display = 'block';
    if (badge) badge.innerText = `${data.length} รายการ`;
    tbody.innerHTML = '';

    data.forEach(item => {
        const avatar = getCompanyAvatar(item.company_name);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="company-cell">
                    <div class="company-avatar" style="width:26px;height:26px;font-size:10.5px;background:${avatar.color};">${escapeHtml(avatar.initial)}</div>
                    <b>${escapeHtml(item.company_name)}</b>
                </div>
            </td>
            <td><span style="color: var(--psu-deep); font-weight: 500;">${escapeHtml(item.position_title)}</span></td>
            <td>${escapeHtml(item.location)}</td>
            <td style="color: var(--status-open); font-weight: 600;">${escapeHtml(item.salary)}</td>
            <td style="font-size: 11px; color: #64748b;">${escapeHtml(item.application_channel)}</td>
            <td>${statusPillHtml(item.status)}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function syncToDatabase() {
    if (!parsedExcelData || parsedExcelData.length === 0) {
        Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลสำหรับซิงก์ กรุณาอัปโหลดไฟล์ Excel ก่อน', 'warning');
        return;
    }

    const recordCount = parsedExcelData.length;
    const cleanPayload = parsedExcelData.map(item => ({
        company_name: String(item.company_name || '-').trim(),
        position_title: String(item.position_title || '-').trim(),
        quota: String(item.quota || 'ไม่ระบุ').trim(),
        location: String(item.location || 'ไม่ระบุ').trim(),
        work_format: String(item.work_format || 'Onsite').trim(),
        salary: String(item.salary || 'ตามตกลง').trim(),
        deadline: String(item.deadline || 'ไม่ระบุ').trim(),
        status: String(item.status || 'เปิดรับสมัครอยู่').trim(),
        application_channel: String(item.application_channel || '-').trim(),
        contact_info: String(item.contact_info || '-').trim(),
        job_type: String(item.job_type || 'สหกิจศึกษา').trim()
    }));

    try {
        Swal.fire({
            title: 'กำลังบันทึกข้อมูล...',
            text: 'กรุณารอสักครู่ ระบบกำลังส่งข้อมูลไปยังฐานข้อมูล',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const { error: jobErr } = await supabaseClient
            .from('cwie_jobs')
            .insert(cleanPayload);

        if (jobErr) throw jobErr;

        const logOk = await logHistoryEntry(uploadedFileName || 'Excel_Import.xlsx', recordCount);

        if (!logOk) {
            Swal.fire({
                icon: 'warning',
                title: 'บันทึกข้อมูลงานสำเร็จ แต่บันทึกประวัติล้มเหลว',
                text: `นำเข้าประกาศงาน ${recordCount} รายการสำเร็จ แต่ไม่สามารถบันทึกลงประวัติการอัปโหลดได้`,
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลเข้าระบบสำเร็จ!',
                text: `นำเข้าประกาศงานจำนวน ${recordCount} รายการเรียบร้อยแล้ว`,
                timer: 2000,
                showConfirmButton: false
            });
        }

        const previewSec = document.getElementById('preview-section');
        if (previewSec) previewSec.style.display = 'none';
        
        parsedExcelData = [];
        const fileInput = document.getElementById('excel-file');
        if (fileInput) fileInput.value = '';

        await fetchCurrentJobs();
        await loadUploadHistory();

    } catch (err) {
        console.error('Supabase Sync Error:', err);
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
            text: err.message || 'ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้'
        });
    }
}

async function loadUploadHistory() {
    const historyBody = document.getElementById('history-body');
    if (!historyBody) return;
    historyBody.innerHTML = skeletonRowsHtml(6, 3);

    try {
        if (typeof supabaseClient === 'undefined') return;

        const { data, error } = await supabaseClient
            .from('cwie_logs')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;
        const logs = data || [];

        if (logs.length === 0) {
            historyBody.innerHTML = emptyRowHtml(6, 'ยังไม่มีประวัติการอัปโหลด');
            return;
        }

        historyBody.innerHTML = '';
        logs.forEach(log => {
            const dateObj = log.uploaded_at ? new Date(log.uploaded_at) : new Date();
            const dateStr = dateObj.toLocaleString('th-TH', {
                year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(dateStr)}</td>
                <td><b>${escapeHtml(log.filename) || 'Excel Import'}</b></td>
                <td><span class="badge-count">${escapeHtml(log.record_count) || 0} รายการ</span></td>
                <td>${escapeHtml(log.uploaded_by) || 'Admin'}</td>
                <td><span class="status-pill status-pill--open"><span class="dot"></span>สำเร็จ</span></td>
                <td style="text-align: center;">
                    <button onclick="deleteLog(${Number(log.id)})" class="btn-delete-sm icon-btn" aria-label="ลบประวัตินี้">${ROW_ICONS.trash}</button>
                </td>
            `;
            historyBody.appendChild(tr);
        });
    } catch (err) {
        console.error("Load History Error:", err);
        historyBody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-rose-500">ไม่สามารถโหลดประวัติได้: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function deleteLog(id) {
    try {
        await supabaseClient.from('cwie_logs').delete().eq('id', id);
        loadUploadHistory();
    } catch (err) { console.warn(err); }
}

async function clearUploadHistory() {
    const result = await Swal.fire({
        title: 'ยืนยันการล้างประวัติ?',
        text: 'ประวัติการอัปโหลดทั้งหมดจะถูกลบออก',
        icon: 'warning',    
        showCancelButton: true,
        confirmButtonText: 'ล้างประวัติ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#f59e0b'
    });

    if (result.isConfirmed) {
        try {
            await supabaseClient.from('cwie_logs').delete().not('id', 'is', null);
            loadUploadHistory();
            Swal.fire({ icon: 'success', title: 'ล้างประวัติสำเร็จ', timer: 1000, showConfirmButton: false });
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}
