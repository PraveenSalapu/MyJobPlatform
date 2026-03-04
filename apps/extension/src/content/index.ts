// Content Script Entry Point
// Injected into every page to detect job applications and show the widget

import { detectJobPage, getPlatformInfo } from './detector';
import { scrapeJobData, quickScrape } from './scraper';
import { detectFormFields, fillFormFields, quickFill, getFieldsSummary, uploadFileToInput, getResumeFileInputs, detectEssayQuestions, fillEssayField, fillCoverLetter } from './autofill';
import type { Resume, EssayQuestion, EssayResponse } from '@careerflow/shared';

// Global state
let widgetInjected = false;
let modalInjected = false;
let pendingAutofill: { id: string; profileId: string; tailoredResume: any; coverLetter?: string | null } | null = null;

// App URL - injected at build time via Vite's define or falls back to localhost
declare const __APP_URL__: string | undefined;
const APP_URL = typeof __APP_URL__ !== 'undefined' ? __APP_URL__ : 'http://localhost:5173';

// Initialize on page load
async function initialize(): Promise<void> {
  try {
    // Wait for DOM to be ready
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve));
    }

    // Check if extension context is valid
    if (!chrome.runtime?.id) {
      console.log('[CareerFlow] Extension context invalid, skipping');
      return;
    }

    // Check if we're logged in
    const auth = await chrome.storage.sync.get(['authToken', 'user']);
    console.log('[CareerFlow] Auth check:', { hasToken: !!auth.authToken, user: auth.user?.email });
    if (!auth.authToken) {
      console.log('[CareerFlow] Not logged in, widget disabled. Please log in via the extension popup or visit the CareerFlow app.');
      // Still start the observer so we can detect if user logs in later
      startObserver();
      return;
    }


    // Start the mutation observer for SPA support
    startObserver();

    // Check for pending autofill from the app
    const detection = detectJobPage();
    console.log('[CareerFlow] Page detection:', detection);

    if (detection.isJobPage && detection.confidence >= 40) {
      // Check for pending autofill from the app
      await checkForPendingAutofill();

      injectWidget(detection.platform || 'generic');
    }
  } catch (error) {
    console.error('[CareerFlow] Initialization error:', error);
  }
}

// Re-run detection on dynamic content changes (SPA support)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;

function startObserver(): void {
  if (observer || !document.body) return;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!widgetInjected) {
        try {
          // Check auth before detecting
          const auth = await chrome.storage.sync.get('authToken');
          if (!auth.authToken) return;

          const detection = detectJobPage();
          if (detection.isJobPage && detection.confidence >= 40) {
            injectWidget(detection.platform || 'generic');
          }
        } catch (error) {
          console.error('[CareerFlow] Observer detection error:', error);
        }
      }
    }, 1000); // Wait 1s after changes stop
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Listen for manual scan request from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'ok' });
  } else if (message.type === 'SCAN_PAGE') {
    console.log('[CareerFlow] Manual scan requested');
    const detection = detectJobPage();

    // FORCE inject on manual scan, even if detection low confidence
    // Use detected platform or default to generic
    const platform = detection.platform || 'generic';
    injectWidget(platform);

    sendResponse({ success: true, detection: { ...detection, isJobPage: true } });
  }
  return true;
});

// Check if current page is the CareerFlow app
function isCareerFlowApp(): boolean {
  const url = window.location.href;
  // Check against configured APP_URL (handles production domains)
  if (APP_URL && url.startsWith(APP_URL)) return true;
  // Fallback checks for dev and known domains
  return url.includes('localhost:5173') || url.includes('careerflow');
}

// Sync session from the main web app
async function syncSession(): Promise<boolean> {
  // Check if we are on the main app
  if (!isCareerFlowApp()) return false;

  console.log('[CareerFlow] Detected App URL, attempting to sync session...');

  try {
    // Find Supabase token in localStorage
    // Key format: sb-<project-ref>-auth-token
    let sessionData = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            sessionData = JSON.parse(value);
            break;
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    if (sessionData) {
      console.log('[CareerFlow] Found session data, syncing...');
      await chrome.runtime.sendMessage({
        type: 'SYNC_SESSION',
        session: sessionData
      });
      console.log('[CareerFlow] Session synced successfully!');
      return true;
    }
  } catch (err) {
    console.error('[CareerFlow] Error syncing session:', err);
  }
  return false;
}

// Initialize on page load
// Also run sync immediately if on app, and keep checking until found
if (isCareerFlowApp()) {
  // Initial check
  syncSession();

  // Poll every 2 seconds to catch login/logout events
  // This is necessary because localStorage events don't fire on the same tab
  const syncInterval = setInterval(async () => {
    const success = await syncSession();
    if (success) {
      // If we synced successfully, we can slow down or stop polling
      // But keeping it running allows catching logout/account switching
      // clearInterval(syncInterval);
    }
  }, 2000);

  // Clean up on unload
  window.addEventListener('unload', () => clearInterval(syncInterval));
}

// Check if there's a pending autofill for this URL
async function checkForPendingAutofill(): Promise<void> {
  try {
    const currentUrl = window.location.href;
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_PENDING_AUTOFILL',
      url: currentUrl,
    });

    if (response.found && response.autofill) {
      console.log('[CareerFlow] Found pending autofill!', response.autofill);
      pendingAutofill = {
        id: response.autofill.id,
        profileId: response.autofill.profileId,
        tailoredResume: response.autofill.tailoredResume,
        coverLetter: response.autofill.coverLetter || null,
      };

      // Show notification that we'll auto-fill
      showPendingAutofillBanner();
    }
  } catch (error) {
    console.error('[CareerFlow] Error checking pending autofill:', error);
  }
}

// Show a banner when there's a pending autofill
function showPendingAutofillBanner(): void {
  const banner = document.createElement('div');
  banner.id = 'careerflow-pending-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  banner.innerHTML = `
    <span>🚀 CareerFlow has your tailored resume ready!</span>
    <button id="cf-autofill-now" style="
      background: white;
      color: #667eea;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    ">Auto-Fill Now</button>
    <button id="cf-dismiss-banner" style="
      background: transparent;
      color: white;
      border: 1px solid rgba(255,255,255,0.5);
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
    ">Later</button>
  `;

  document.body.appendChild(banner);

  // Handle auto-fill button
  document.getElementById('cf-autofill-now')?.addEventListener('click', async () => {
    banner.remove();
    if (pendingAutofill) {
      await autoFillWithPendingData();
    }
  });

  // Handle dismiss
  document.getElementById('cf-dismiss-banner')?.addEventListener('click', () => {
    banner.remove();
  });
}

// Auto-fill using the pending tailored resume data
async function autoFillWithPendingData(): Promise<void> {
  if (!pendingAutofill) return;

  try {
    const resume = pendingAutofill.tailoredResume as Resume;

    // Fill form fields
    const result = await fillFormFields(resume);
    console.log('[CareerFlow] Auto-filled with pending data:', result);

    // Fill cover letter if available
    if (pendingAutofill.coverLetter) {
      console.log('[CareerFlow] Filling cover letter field...');
      const coverLetterFilled = await fillCoverLetter(pendingAutofill.coverLetter);
      if (coverLetterFilled) {
        console.log('[CareerFlow] Cover letter filled successfully!');
      } else {
        console.log('[CareerFlow] No cover letter field found or fill failed');
      }
    }

    // Try to upload the tailored resume PDF
    const fileInputs = getResumeFileInputs();
    if (fileInputs.length > 0) {
      console.log('[CareerFlow] Fetching tailored PDF for autofill:', pendingAutofill.id);
      // Use the new tailored PDF endpoint which generates PDF from the stored tailored resume
      const pdfResponse = await chrome.runtime.sendMessage({
        type: 'GET_TAILORED_PDF',
        autofillId: pendingAutofill.id,
      });

      if (pdfResponse.pdf && pdfResponse.filename) {
        console.log('[CareerFlow] Uploading tailored PDF:', pdfResponse.filename);
        const uploadResult = await uploadFileToInput(pdfResponse.pdf, pdfResponse.filename, 'application/pdf');
        console.log('[CareerFlow] PDF upload result:', uploadResult);
      } else if (pdfResponse.error) {
        console.error('[CareerFlow] Failed to get tailored PDF:', pdfResponse.error);
      }
    }

    // Mark autofill as completed
    await chrome.runtime.sendMessage({
      type: 'COMPLETE_AUTOFILL',
      autofillId: pendingAutofill.id,
    });

    // Show success message
    const hasCoverLetter = !!pendingAutofill.coverLetter;
    showSuccessToast(hasCoverLetter
      ? '✅ Application auto-filled with resume & cover letter!'
      : '✅ Application auto-filled with your tailored resume!');

    pendingAutofill = null;
  } catch (error) {
    console.error('[CareerFlow] Auto-fill error:', error);
    showSuccessToast('❌ Auto-fill failed. Try manual fill.');
  }
}

// Simple toast notification
function showSuccessToast(message: string): void {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 24px;
    background: #1f2937;
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    z-index: 2147483647;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Inject the floating widget button
function injectWidget(platform: string): void {
  if (widgetInjected) return;
  widgetInjected = true;

  // Create widget container with Shadow DOM for style isolation
  const widgetHost = document.createElement('div');
  widgetHost.id = 'careerflow-widget-host';
  const shadow = widgetHost.attachShadow({ mode: 'closed' });

  // Inject styles
  const styles = document.createElement('style');
  styles.textContent = `
    .cf-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .cf-widget:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
    }
    .cf-widget svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    .cf-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #22c55e;
      color: white;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 10px;
      font-family: system-ui, sans-serif;
    }
    .cf-tooltip {
      position: absolute;
      bottom: 70px;
      right: 0;
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-family: system-ui, sans-serif;
      white-space: nowrap;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }
    .cf-widget:hover .cf-tooltip {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  shadow.appendChild(styles);

  // Create widget button
  const widget = document.createElement('div');
  widget.className = 'cf-widget';
  widget.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <path d="M14 2v6h6"/>
      <path d="M16 13H8"/>
      <path d="M16 17H8"/>
      <path d="M10 9H8"/>
    </svg>
    <div class="cf-tooltip">Auto-fill with CareerFlow</div>
  `;

  // Add click handler
  widget.addEventListener('click', () => {
    showModal(platform);
  });

  shadow.appendChild(widget);
  document.body.appendChild(widgetHost);

  console.log('[CareerFlow] Widget injected');
}

// Show the auto-fill modal overlay
async function showModal(platform: string): Promise<void> {
  if (modalInjected) {
    // Show existing modal
    const existingHost = document.getElementById('careerflow-modal-host');
    if (existingHost) {
      existingHost.style.display = 'block';
      return;
    }
  }

  modalInjected = true;

  // Create modal host with Shadow DOM
  const modalHost = document.createElement('div');
  modalHost.id = 'careerflow-modal-host';
  const shadow = modalHost.attachShadow({ mode: 'closed' });

  // Inject styles
  const styles = document.createElement('style');
  styles.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .cf-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .cf-modal {
      background: #1f2937;
      border-radius: 16px;
      width: 90%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
      color: #f3f4f6;
    }

    .cf-header {
      padding: 20px 24px;
      border-bottom: 1px solid #374151;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .cf-title {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cf-close {
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
    }
    .cf-close:hover { color: #f3f4f6; }

    .cf-body {
      padding: 24px;
    }

    .cf-job-info {
      background: #374151;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .cf-job-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .cf-job-company {
      font-size: 14px;
      color: #9ca3af;
    }

    .cf-section {
      margin-bottom: 20px;
    }

    .cf-section-title {
      font-size: 14px;
      font-weight: 500;
      color: #9ca3af;
      margin-bottom: 8px;
    }

    .cf-select {
      width: 100%;
      padding: 12px;
      background: #374151;
      border: 1px solid #4b5563;
      border-radius: 8px;
      color: #f3f4f6;
      font-size: 14px;
      cursor: pointer;
    }
    .cf-select:focus {
      outline: none;
      border-color: #667eea;
    }

    .cf-textarea {
      width: 100%;
      padding: 12px;
      background: #374151;
      border: 1px solid #4b5563;
      border-radius: 8px;
      color: #f3f4f6;
      font-size: 13px;
      resize: vertical;
      min-height: 120px;
      font-family: inherit;
    }
    .cf-textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .cf-textarea::placeholder {
      color: #6b7280;
    }

    .cf-warning {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      color: #92400e;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
    }

    .cf-warning-title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .cf-fields-list {
      background: #374151;
      border-radius: 8px;
      padding: 12px;
      max-height: 200px;
      overflow-y: auto;
    }

    .cf-field-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #4b5563;
    }
    .cf-field-item:last-child { border-bottom: none; }

    .cf-field-name {
      font-size: 13px;
      text-transform: capitalize;
    }

    .cf-field-status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .cf-field-status.ready { background: #22c55e33; color: #22c55e; }
    .cf-field-status.missing { background: #ef444433; color: #ef4444; }

    .cf-btn {
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .cf-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .cf-btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .cf-btn-primary:hover:not(:disabled) { opacity: 0.9; }

    .cf-progress {
      margin-top: 16px;
    }

    .cf-progress-bar {
      height: 4px;
      background: #374151;
      border-radius: 2px;
      overflow: hidden;
    }

    .cf-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s;
    }

    .cf-progress-text {
      font-size: 13px;
      color: #9ca3af;
      margin-top: 8px;
      text-align: center;
    }

    .cf-status {
      text-align: center;
      padding: 20px;
    }

    .cf-status-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .cf-status-text {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .cf-status-sub {
      font-size: 13px;
      color: #9ca3af;
    }

    .cf-collapsible {
      margin-bottom: 16px;
    }

    .cf-collapsible-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 13px;
      cursor: pointer;
      padding: 4px 0;
    }
    .cf-collapsible-toggle:hover {
      color: #f3f4f6;
    }

    .cf-collapsible-content {
      margin-top: 8px;
    }

    /* Essay UI Styles */
    .cf-essay-section {
      margin-top: 16px;
      border-top: 1px solid #374151;
      padding-top: 16px;
    }

    .cf-essay-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .cf-essay-title {
      font-size: 14px;
      font-weight: 500;
      color: #9ca3af;
    }

    .cf-btn-generate {
      padding: 8px 12px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .cf-btn-generate:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .cf-btn-generate:hover:not(:disabled) {
      opacity: 0.9;
    }

    .cf-essay-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 300px;
      overflow-y: auto;
    }

    .cf-essay-card {
      background: #374151;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #4b5563;
    }
    .cf-essay-card.skipped {
      opacity: 0.5;
    }
    .cf-essay-card.low-confidence {
      border-color: #f59e0b;
    }

    .cf-essay-question {
      font-size: 13px;
      color: #d1d5db;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .cf-essay-status {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }

    .cf-status-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }
    .cf-status-badge.pending {
      background: #6b728033;
      color: #9ca3af;
    }
    .cf-status-badge.generating {
      background: #3b82f633;
      color: #60a5fa;
    }
    .cf-status-badge.ready {
      background: #22c55e33;
      color: #22c55e;
    }
    .cf-status-badge.error {
      background: #ef444433;
      color: #ef4444;
    }

    .cf-essay-response {
      width: 100%;
      min-height: 100px;
      padding: 10px;
      background: #1f2937;
      border: 1px solid #4b5563;
      border-radius: 6px;
      color: #f3f4f6;
      font-size: 12px;
      font-family: inherit;
      line-height: 1.5;
      resize: vertical;
    }
    .cf-essay-response:focus {
      outline: none;
      border-color: #667eea;
    }
    .cf-essay-response::placeholder {
      color: #6b7280;
    }

    .cf-essay-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 11px;
      color: #6b7280;
    }

    .cf-essay-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .cf-essay-skip {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #9ca3af;
      cursor: pointer;
    }
    .cf-essay-skip input {
      cursor: pointer;
    }

    .cf-confidence-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cf-confidence-indicator.high { color: #22c55e; }
    .cf-confidence-indicator.medium { color: #f59e0b; }
    .cf-confidence-indicator.low { color: #ef4444; }

    .cf-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #374151;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: cf-spin 0.8s linear infinite;
    }
    @keyframes cf-spin {
      to { transform: rotate(360deg); }
    }
  `;
  shadow.appendChild(styles);

  // Scrape job info
  const jobInfo = quickScrape();

  // Get detected fields
  const fieldsSummary = getFieldsSummary();

  // Detect essay questions
  const essayQuestions = detectEssayQuestions();
  console.log('[CareerFlow] Detected essay questions:', essayQuestions);

  // Check if scraping failed
  const scrapedJob = await scrapeJobData(platform);
  const scrapeFailed = !scrapedJob.description ||
    scrapedJob.description === 'No description available' ||
    scrapedJob.description.length < 100;

  // Create modal content
  const overlay = document.createElement('div');
  overlay.className = 'cf-overlay';
  overlay.innerHTML = `
    <div class="cf-modal">
      <div class="cf-header">
        <div class="cf-title">
          <span>⚡</span>
          <span>CareerFlow Auto-Fill</span>
        </div>
        <button class="cf-close">&times;</button>
      </div>
      <div class="cf-body">
        <div class="cf-job-info">
          <div class="cf-job-title">${escapeHtml(jobInfo.title)}</div>
          <div class="cf-job-company">${escapeHtml(jobInfo.company)}</div>
        </div>

        ${scrapeFailed ? `
          <div class="cf-warning">
            <div class="cf-warning-title">Could not read job description</div>
            <div>This job site format is not recognized.</div>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            <button class="cf-btn" id="cf-ai-extract-btn" style="flex: 1; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white;">
              🤖 AI Extract
            </button>
            <button class="cf-btn" id="cf-show-manual-btn" style="flex: 1; background: #374151; color: white; border: 1px solid #4b5563;">
              ✏️ Paste Manually
            </button>
          </div>
          <div class="cf-section" id="cf-manual-section" style="display: none;">
            <div class="cf-section-title">Job Description (paste here)</div>
            <textarea class="cf-textarea" id="cf-manual-description" placeholder="Paste the job requirements, qualifications, and responsibilities here..."></textarea>
          </div>
        ` : `
          <div class="cf-collapsible">
            <button class="cf-collapsible-toggle" id="cf-toggle-description">
              <span id="cf-toggle-icon">▶</span> Edit job description
            </button>
            <div class="cf-collapsible-content" id="cf-description-content" style="display: none;">
              <textarea class="cf-textarea" id="cf-manual-description" placeholder="Edit the scraped job description...">${escapeHtml(scrapedJob.description.substring(0, 5000))}</textarea>
            </div>
          </div>
        `}

        <div class="cf-section">
          <div class="cf-section-title">Select Profile</div>
          <select class="cf-select" id="cf-profile-select">
            <option value="">Loading profiles...</option>
          </select>
        </div>

        <div class="cf-section">
          <div class="cf-section-title">Detected Fields (${fieldsSummary.length})</div>
          <div class="cf-fields-list">
            ${fieldsSummary.map(f => `
              <div class="cf-field-item">
                <span class="cf-field-name">${f.label || f.purpose.replace(/_/g, ' ')}</span>
                <span class="cf-field-status ${f.filled ? 'ready' : 'ready'}">Ready</span>
              </div>
            `).join('')}
            ${fieldsSummary.length === 0 ? '<div style="color: #9ca3af; text-align: center; padding: 16px;">No fillable fields detected</div>' : ''}
          </div>
        </div>

        ${essayQuestions.length > 0 ? `
        <div class="cf-essay-section" id="cf-essay-section">
          <div class="cf-essay-header">
            <div class="cf-essay-title">Essay Questions (${essayQuestions.length})</div>
            <button class="cf-btn-generate" id="cf-generate-essays-btn">
              🤖 Generate AI Responses
            </button>
          </div>
          <div class="cf-essay-list" id="cf-essay-list">
            ${essayQuestions.map(q => `
              <div class="cf-essay-card" data-question-id="${q.id}" data-selector="${escapeHtml(q.fieldSelector)}">
                <div class="cf-essay-question">${escapeHtml(q.question.substring(0, 200))}${q.question.length > 200 ? '...' : ''}</div>
                <div class="cf-essay-status">
                  <span class="cf-status-badge pending">Pending</span>
                  ${q.required ? '<span style="color: #ef4444; font-size: 11px;">*Required</span>' : ''}
                </div>
                <textarea class="cf-essay-response" placeholder="Click 'Generate AI Responses' to fill this..." data-question-id="${q.id}"></textarea>
                <div class="cf-essay-meta">
                  <span class="cf-word-count">0 words</span>
                  ${q.maxLength ? `<span>/ ${q.maxLength} chars max</span>` : ''}
                </div>
                <div class="cf-essay-actions">
                  <label class="cf-essay-skip">
                    <input type="checkbox" data-question-id="${q.id}">
                    Skip this question
                  </label>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="cf-btn-generate" id="cf-regenerate-essays-btn" style="margin-top: 12px; width: 100%; display: none;">
            🔄 Regenerate All Responses
          </button>
        </div>
        ` : ''}

        <div style="display: flex; gap: 12px; flex-direction: column;">
          <button class="cf-btn cf-btn-primary" id="cf-autofill-btn" ${fieldsSummary.length === 0 ? 'disabled' : ''}>
            Start Auto-Fill
          </button>
          <button class="cf-btn" id="cf-tailor-btn" style="background: #374151; color: white; border: 1px solid #4b5563;">
            ✨ Tailor Resume First
          </button>
        </div>

        <div class="cf-progress" style="display: none;">
          <div class="cf-progress-bar">
            <div class="cf-progress-fill" style="width: 0%"></div>
          </div>
          <div class="cf-progress-text">Filling fields...</div>
        </div>
      </div>
    </div>
  `;

  shadow.appendChild(overlay);
  document.body.appendChild(modalHost);

  // Event handlers
  const closeBtn = shadow.querySelector('.cf-close');
  closeBtn?.addEventListener('click', () => {
    modalHost.style.display = 'none';
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      modalHost.style.display = 'none';
    }
  });

  // Toggle description editor (if scraping succeeded)
  const toggleBtn = shadow.getElementById('cf-toggle-description');
  const toggleIcon = shadow.getElementById('cf-toggle-icon');
  const descriptionContent = shadow.getElementById('cf-description-content');
  if (toggleBtn && toggleIcon && descriptionContent) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = descriptionContent.style.display === 'none';
      descriptionContent.style.display = isHidden ? 'block' : 'none';
      toggleIcon.textContent = isHidden ? '▼' : '▶';
    });
  }

  // AI Extract button handler (if scraping failed)
  const aiExtractBtn = shadow.getElementById('cf-ai-extract-btn') as HTMLButtonElement;
  const showManualBtn = shadow.getElementById('cf-show-manual-btn');
  const manualSection = shadow.getElementById('cf-manual-section');

  if (aiExtractBtn) {
    aiExtractBtn.addEventListener('click', async () => {
      aiExtractBtn.disabled = true;
      aiExtractBtn.textContent = '🔄 Extracting...';

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'EXTRACT_JOB_AI',
          url: window.location.href,
          partialData: { title: jobInfo.title, company: jobInfo.company },
        });

        if (response.error) {
          throw new Error(response.error);
        }

        // Update the job info display
        const jobTitleEl = shadow.querySelector('.cf-job-title');
        const jobCompanyEl = shadow.querySelector('.cf-job-company');
        if (jobTitleEl && response.data.title) jobTitleEl.textContent = response.data.title;
        if (jobCompanyEl && response.data.company) jobCompanyEl.textContent = response.data.company;

        // Update jobInfo for later use
        if (response.data.title) jobInfo.title = response.data.title;
        if (response.data.company) jobInfo.company = response.data.company;

        // Show the extracted description in the manual input
        const manualInput = shadow.getElementById('cf-manual-description') as HTMLTextAreaElement;
        if (manualInput && response.data.description) {
          manualInput.value = response.data.description;
        }

        // Update button to show success
        aiExtractBtn.textContent = '✅ Extracted!';
        aiExtractBtn.style.background = '#22c55e';

        // Show the extracted description for review
        if (manualSection) manualSection.style.display = 'block';

        // Hide the warning
        const warning = shadow.querySelector('.cf-warning') as HTMLElement;
        if (warning) warning.style.display = 'none';

      } catch (error) {
        console.error('[CareerFlow] AI extraction error:', error);
        aiExtractBtn.textContent = '❌ Failed - Try Manual';
        aiExtractBtn.style.background = '#ef4444';
        if (manualSection) manualSection.style.display = 'block';

        setTimeout(() => {
          aiExtractBtn.textContent = '🤖 AI Extract';
          aiExtractBtn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
          aiExtractBtn.disabled = false;
        }, 3000);
      }
    });
  }

  if (showManualBtn && manualSection) {
    showManualBtn.addEventListener('click', () => {
      manualSection.style.display = manualSection.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Load profiles
  await loadProfiles(shadow);

  // Auto-fill button handler
  const autofillBtn = shadow.getElementById('cf-autofill-btn');
  autofillBtn?.addEventListener('click', async () => {
    await handleAutoFill(shadow, platform);
  });

  // Tailor Resume button handler
  const tailorBtn = shadow.getElementById('cf-tailor-btn');
  tailorBtn?.addEventListener('click', async () => {
    // Get manual description if entered
    const manualDescInput = shadow.getElementById('cf-manual-description') as HTMLTextAreaElement;
    const manualDescription = manualDescInput?.value?.trim();
    await handleTailorResume(shadow, platform, jobInfo, manualDescription);
  });

  // Essay generation button handlers
  const generateEssaysBtn = shadow.getElementById('cf-generate-essays-btn');
  const regenerateEssaysBtn = shadow.getElementById('cf-regenerate-essays-btn');

  const handleEssayGeneration = async () => {
    const profileSelect = shadow.getElementById('cf-profile-select') as HTMLSelectElement;
    if (!profileSelect?.value) {
      alert('Please select a profile first');
      return;
    }

    // Get job description
    const manualDescInput = shadow.getElementById('cf-manual-description') as HTMLTextAreaElement;
    const jobDescription = manualDescInput?.value?.trim() || scrapedJob.description || '';

    if (jobDescription.length < 50) {
      alert('Job description is too short. Please paste the job description manually.');
      return;
    }

    // Update UI to show generating state
    const essayCards = shadow.querySelectorAll('.cf-essay-card');
    essayCards.forEach(card => {
      const badge = card.querySelector('.cf-status-badge');
      if (badge) {
        badge.className = 'cf-status-badge generating';
        badge.innerHTML = '<span class="cf-spinner"></span> Generating...';
      }
    });

    if (generateEssaysBtn) {
      (generateEssaysBtn as HTMLButtonElement).disabled = true;
      generateEssaysBtn.textContent = '⏳ Generating...';
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_ESSAYS',
        profileId: profileSelect.value,
        jobDescription,
        jobTitle: jobInfo.title,
        company: jobInfo.company,
        questions: essayQuestions,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Populate responses into the textareas
      const essayResponses = response.responses as EssayResponse[];
      essayResponses.forEach(r => {
        const card = shadow.querySelector(`.cf-essay-card[data-question-id="${r.questionId}"]`);
        if (!card) return;

        const textarea = card.querySelector('.cf-essay-response') as HTMLTextAreaElement;
        const badge = card.querySelector('.cf-status-badge');
        const wordCount = card.querySelector('.cf-word-count');

        if (textarea) {
          textarea.value = r.response;
          textarea.placeholder = 'Edit the generated response as needed...';
        }

        if (badge) {
          badge.className = 'cf-status-badge ready';
          badge.textContent = 'Ready';
        }

        if (wordCount) {
          wordCount.textContent = `${r.wordCount} words`;
        }

        // Mark low confidence responses
        if (r.confidence < 60) {
          card.classList.add('low-confidence');
        }
      });

      // Show regenerate button, hide generate button
      if (generateEssaysBtn) generateEssaysBtn.style.display = 'none';
      if (regenerateEssaysBtn) regenerateEssaysBtn.style.display = 'block';

      console.log('[CareerFlow] Essay responses generated:', essayResponses);

    } catch (error) {
      console.error('[CareerFlow] Essay generation error:', error);

      // Update UI to show error
      essayCards.forEach(card => {
        const badge = card.querySelector('.cf-status-badge');
        if (badge) {
          badge.className = 'cf-status-badge error';
          badge.textContent = 'Error';
        }
      });

      alert(`Failed to generate essays: ${error instanceof Error ? error.message : 'Unknown error'}`);

      if (generateEssaysBtn) {
        (generateEssaysBtn as HTMLButtonElement).disabled = false;
        generateEssaysBtn.textContent = '🤖 Generate AI Responses';
      }
    }
  };

  generateEssaysBtn?.addEventListener('click', handleEssayGeneration);
  regenerateEssaysBtn?.addEventListener('click', handleEssayGeneration);

  // Update word count on essay textarea input
  const essayTextareas = shadow.querySelectorAll('.cf-essay-response');
  essayTextareas.forEach(textarea => {
    textarea.addEventListener('input', (e) => {
      const target = e.target as HTMLTextAreaElement;
      const card = target.closest('.cf-essay-card');
      const wordCount = card?.querySelector('.cf-word-count');
      if (wordCount) {
        const words = target.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        wordCount.textContent = `${words} words`;
      }
    });
  });

  // Skip checkbox handler
  const skipCheckboxes = shadow.querySelectorAll('.cf-essay-skip input');
  skipCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const card = target.closest('.cf-essay-card');
      if (card) {
        card.classList.toggle('skipped', target.checked);
      }
    });
  });
}

// Handle "Tailor Resume" - scrape job, save to DB, redirect to app
async function handleTailorResume(
  shadow: ShadowRoot,
  platform: string,
  jobInfo: { title: string; company: string },
  manualDescription?: string
): Promise<void> {
  const btn = shadow.getElementById('cf-tailor-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Saving job...';

  try {
    // Scrape full job details
    const fullJobData = await scrapeJobData(platform);
    const currentUrl = window.location.href;

    // Use manual description if provided, otherwise use scraped
    const jobDescription = manualDescription || fullJobData.description;

    // Validate that we have a description
    if (!jobDescription || jobDescription === 'No description available' || jobDescription.length < 50) {
      btn.textContent = 'Please enter job description';
      btn.style.background = '#ef4444';
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = '✨ Tailor Resume First';
        btn.style.background = '#374151';
      }, 3000);
      return;
    }

    // Save job to backend
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_JOB',
      jobData: {
        jobUrl: currentUrl,
        jobTitle: fullJobData.title || jobInfo.title,
        company: fullJobData.company || jobInfo.company,
        jobDescription: jobDescription,
        platform: platform,
      },
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Create URL to app with job data
    const jobData = {
      title: fullJobData.title || jobInfo.title,
      company: fullJobData.company || jobInfo.company,
      description: jobDescription,
      link: currentUrl,
    };

    // Encode job data for URL
    const encodedData = encodeURIComponent(JSON.stringify(jobData));
    const appUrl = `${APP_URL}/app?tailor=true&jobData=${encodedData}`;

    btn.textContent = '🚀 Opening app...';

    // Open app in new tab
    window.open(appUrl, '_blank');

    // Close modal
    const modalHost = document.getElementById('careerflow-modal-host');
    if (modalHost) modalHost.style.display = 'none';

  } catch (error) {
    console.error('[CareerFlow] Tailor error:', error);
    btn.textContent = 'Error - Try Again';
    btn.style.background = '#ef4444';

    setTimeout(() => {
      btn.textContent = '✨ Tailor Resume First';
      btn.style.background = '#374151';
      btn.disabled = false;
    }, 3000);
  }
}

// Load user profiles from backend
async function loadProfiles(shadow: ShadowRoot): Promise<void> {
  const select = shadow.getElementById('cf-profile-select') as HTMLSelectElement;
  if (!select) return;

  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }

    const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILES' });

    if (response.error) {
      select.innerHTML = '<option value="">Error loading profiles</option>';
      return;
    }

    const profiles = response.profiles || [];
    if (profiles.length === 0) {
      select.innerHTML = '<option value="">No profiles found</option>';
      return;
    }

    select.innerHTML = profiles.map((p: { id: string; name: string; isActive: boolean }) =>
      `<option value="${p.id}" ${p.isActive ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');
  } catch (error) {
    console.error('[CareerFlow] Error loading profiles:', error);

    // Check if extension was reloaded
    if (String(error).includes('Extension context invalidated') || !chrome.runtime?.id) {
      select.innerHTML = '<option value="">⚠️ Please refresh page</option>';
      // Show alert to user
      showRefreshNotice(shadow);
    } else {
      select.innerHTML = '<option value="">Error loading profiles</option>';
    }
  }
}

// Show a notice asking user to refresh the page
function showRefreshNotice(shadow: ShadowRoot): void {
  const body = shadow.querySelector('.cf-body');
  if (!body) return;

  const notice = document.createElement('div');
  notice.style.cssText = `
    background: #fef3c7;
    border: 1px solid #f59e0b;
    color: #92400e;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 13px;
    text-align: center;
  `;
  notice.innerHTML = `
    <strong>Extension Updated</strong><br>
    Please <a href="#" style="color: #d97706; font-weight: 600;" onclick="location.reload(); return false;">refresh this page</a> to continue.
  `;
  body.insertBefore(notice, body.firstChild);
}

// Handle auto-fill process
async function handleAutoFill(shadow: ShadowRoot, platform: string): Promise<void> {
  const select = shadow.getElementById('cf-profile-select') as HTMLSelectElement;
  const btn = shadow.getElementById('cf-autofill-btn') as HTMLButtonElement;
  const progress = shadow.querySelector('.cf-progress') as HTMLElement;
  const progressFill = shadow.querySelector('.cf-progress-fill') as HTMLElement;
  const progressText = shadow.querySelector('.cf-progress-text') as HTMLElement;

  if (!select?.value) {
    alert('Please select a profile');
    return;
  }

  // Disable button and show progress
  btn.disabled = true;
  btn.textContent = 'Filling...';
  progress.style.display = 'block';

  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }

    // Get profile data from backend
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PROFILE',
      profileId: select.value,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    const resume = response.profile.data as Resume;

    // Fill the form fields first
    const result = await fillFormFields(resume, (p) => {
      const percent = Math.round(((p.index + 1) / p.total) * 100 * 0.7); // 70% for form filling
      progressFill.style.width = `${percent}%`;
      progressText.textContent = `Filling ${p.field.label || p.field.purpose}... (${p.index + 1}/${p.total})`;
    });

    // Check for file upload fields and try to upload resume PDF
    const fileInputs = getResumeFileInputs();
    let resumeUploaded = false;

    if (fileInputs.length > 0) {
      progressFill.style.width = '80%';
      progressText.textContent = 'Generating resume PDF...';

      try {
        // Fetch resume PDF from backend
        const pdfResponse = await chrome.runtime.sendMessage({
          type: 'GET_RESUME_PDF',
          profileId: select.value,
        });

        if (pdfResponse.pdf && pdfResponse.filename) {
          progressFill.style.width = '90%';
          progressText.textContent = 'Uploading resume...';

          const uploadResult = await uploadFileToInput(
            pdfResponse.pdf,
            pdfResponse.filename,
            'application/pdf'
          );

          if (uploadResult.success) {
            resumeUploaded = true;
            console.log('[CareerFlow] Resume PDF uploaded successfully');
          } else {
            console.log('[CareerFlow] Could not auto-upload resume:', uploadResult.error);
          }
        }
      } catch (pdfError) {
        console.error('[CareerFlow] PDF generation/upload error:', pdfError);
      }
    }

    // Fill essay fields if any were generated
    let essaysFilled = 0;
    const essayCards = shadow.querySelectorAll('.cf-essay-card');
    for (const card of essayCards) {
      // Skip if marked as skipped
      if (card.classList.contains('skipped')) continue;

      const textarea = card.querySelector('.cf-essay-response') as HTMLTextAreaElement;
      const selector = card.getAttribute('data-selector');

      if (textarea?.value && selector) {
        progressText.textContent = `Filling essay question...`;
        const filled = fillEssayField(selector, textarea.value);
        if (filled) essaysFilled++;
      }
    }

    // Show completion status
    progressFill.style.width = '100%';
    progress.style.display = 'none';

    const statusParts = [`✓ Filled ${result.filled}/${result.total} fields`];
    if (essaysFilled > 0) {
      statusParts.push(`+ ${essaysFilled} essays`);
    }
    if (resumeUploaded) {
      statusParts.push('+ Resume uploaded');
    }
    btn.textContent = statusParts.join(' ');
    btn.style.background = '#22c55e';

    setTimeout(() => {
      btn.textContent = 'Start Auto-Fill';
      btn.style.background = '';
      btn.disabled = false;
    }, 3000);

  } catch (error) {
    console.error('[CareerFlow] Auto-fill error:', error);
    progress.style.display = 'none';

    // Check if it's a context invalidation error
    if (String(error).includes('Extension context invalidated') || !chrome.runtime?.id) {
      btn.textContent = 'Refresh Page';
      showRefreshNotice(shadow);
    } else {
      btn.textContent = 'Error - Try Again';
    }
    btn.style.background = '#ef4444';
    btn.disabled = false;

    setTimeout(() => {
      btn.textContent = 'Start Auto-Fill';
      btn.style.background = '';
    }, 3000);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'ok' });
  }
  return true;
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
