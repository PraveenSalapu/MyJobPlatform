// Auto-Fill Engine
// Detects form fields and fills them with resume data

import type { Resume, PersonalInfo, EssayQuestion } from '@careerflow/shared';

export type FieldPurpose =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin'
  | 'website'
  | 'github'
  | 'gender'
  | 'race'
  | 'veteran'
  | 'disability'
  | 'pronouns'
  | 'sexual_orientation'
  | 'hispanic'
  | 'is_lgbtq'
  | 'availability'
  | 'salary'
  | 'relocation'
  | 'resume'
  | 'cover_letter'
  | 'work_authorization'
  | 'sponsorship'
  | 'country'
  | 'non_compete'
  | 'referral_source'
  | 'unknown';

export interface FormField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  type: 'text' | 'email' | 'phone' | 'select' | 'file' | 'textarea';
  purpose: FieldPurpose;
  label?: string;
  confidence: number; // 0-100
}

export interface FillProgress {
  field: FormField;
  index: number;
  total: number;
  success: boolean;
}

// Field detection patterns
const FIELD_PATTERNS: Record<FieldPurpose, RegExp[]> = {
  first_name: [
    /first.?name/i,
    /fname/i,
    /given.?name/i,
    /^name$/i, // Only if standalone
  ],
  last_name: [
    /last.?name/i,
    /lname/i,
    /sur.?name/i,
    /family.?name/i,
  ],
  full_name: [
    /full.?name/i,
    /your.?name/i,
    /candidate.?name/i,
    /applicant.?name/i,
    /^name$/i,
  ],
  email: [
    /e-?mail/i,
    /email.?address/i,
  ],
  phone: [
    /phone/i,
    /mobile/i,
    /\btel\b/i, // Match "tel" as whole word only, not "tell"
    /cell/i,
    /contact.?number/i,
    /telephone/i,
  ],
  location: [
    /location/i,
    /city/i,
    /address/i,
    /zip/i,
    /postal/i,
    /where.?you.?live/i,
  ],
  linkedin: [
    /linkedin/i,
    /linked.?in/i,
  ],
  website: [
    /website/i,
    /portfolio/i,
    /personal.?url/i,
    /personal.?site/i,
  ],
  github: [
    /github/i,
    /git.?hub/i,
  ],
  gender: [
    /gender/i,
    /sex\b/i, // Match "sex" word boundary
  ],
  race: [
    /race/i,
    /ethnicity/i,
  ],
  veteran: [
    /veteran/i,
    /military/i,
    /armed forces/i,
  ],
  disability: [
    /disability/i,
    /handicap/i,
  ],
  pronouns: [
    /pronoun/i,
  ],
  sexual_orientation: [
    /sexual.?orientation/i,
  ],
  is_lgbtq: [
    /lgbt/i,
  ],
  hispanic: [
    /hispanic/i,
    /latino/i,
    /spanish.?origin/i
  ],
  availability: [
    /start.?date/i,
    /notice.?period/i,
    /available/i,
    /earliest/i,
    /when.*start/i,
  ],
  salary: [
    /salary/i,
    /pay/i,
    /compensation/i,
    /rate/i,
    /expect.*range/i
  ],
  relocation: [
    /relocate/i,
    /relocation/i,
  ],
  resume: [
    /resume/i,
    /\bcv\b/i, // Match "CV" as whole word only
    /curriculum.?vitae/i,
  ],
  cover_letter: [
    /cover.?letter/i,
    /coverletter/i,
    /\bcover\b.*\bletter\b/i,
  ],
  work_authorization: [
    /work.*(authorization|eligib)/i,
    /legally.*(work|eligible)/i,
    /authorized.*work/i,
    /eligible.*work/i,
    /right.*work/i,
    /work.*status/i,
  ],
  sponsorship: [
    /sponsor/i,
    /visa.*support/i,
    /immigration/i,
    /require.*visa/i,
  ],
  country: [
    /country/i,
    /nation/i,
    /citizenship/i,
    /where.*located/i,
  ],
  non_compete: [
    /non.?compete/i,
    /non.?competition/i,
    /compete.*agreement/i,
    /restrictive.*covenant/i,
  ],
  referral_source: [
    /how.*hear/i,
    /where.*hear/i,
    /how.*find.*us/i,
    /referr/i,
    /source/i,
  ],
  unknown: [],
};

// Fields that should only match SHORT input fields, NOT textareas
const SHORT_FIELD_PURPOSES: FieldPurpose[] = [
  'first_name', 'last_name', 'full_name', 'email', 'phone',
  'location', 'linkedin', 'website', 'github', 'salary', 'availability'
];

// Detect the purpose of a form field
function detectFieldPurpose(element: HTMLElement): { purpose: FieldPurpose; confidence: number } {
  // IMPORTANT: Textareas should NOT be auto-filled with short personal info
  // They are meant for long-form answers (essay questions, cover letters, etc.)
  const isTextarea = element instanceof HTMLTextAreaElement;

  const attributes = [
    element.getAttribute('name'),
    element.getAttribute('id'),
    element.getAttribute('placeholder'),
    element.getAttribute('aria-label'),
    element.getAttribute('data-testid'),
    element.getAttribute('autocomplete'),
  ].filter(Boolean).join(' ').toLowerCase();

  // Tier 2: Heuristic Label Proximity Search (SpeedyApply reverse-engineered method)
  let labelText = '';

  // 1. Explicit ID association
  const id = element.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) labelText += ' ' + (label.textContent || '');
  }

  // 2. Implicit Parent Label wrap
  const parentLabel = element.closest('label');
  if (parentLabel) labelText += ' ' + (parentLabel.textContent || '');

  // 3. Aria-LabelledBy relationship
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) labelText += ' ' + (labelEl.textContent || '');
  }

  // 4. Proximity sibiling heuristic (common in React/Vue SPAs where inputs and labels are disconnected)
  const previousSibling = element.previousElementSibling;
  if (previousSibling && /label|span|div/i.test(previousSibling.tagName)) {
    labelText += ' ' + (previousSibling.textContent || '');
  }

  // 5. Parent container heading (common for radio button groups like standard gender/veteran selects)
  const container = element.closest('fieldset, .form-group, .field-wrapper, [role="group"]');
  if (container) {
    const legend = container.querySelector('legend, .label-text, span');
    if (legend) labelText += ' ' + (legend.textContent || '');
  }

  // Clean strings
  const cleanLabelText = labelText.replace(/[\n\r]/g, ' ').replace(/\s{2,}/g, ' ').toLowerCase();

  // We cap matching text length intentionally so we don't accidentally parse essays
  // Demographics questions can be long, so cap is around 150 chars.
  const searchText = attributes + ' ' + cleanLabelText.substring(0, 150);

  // Check autocomplete attribute first (high confidence)
  const autocomplete = element.getAttribute('autocomplete');
  if (autocomplete) {
    if (/given-name|first/i.test(autocomplete)) return { purpose: 'first_name', confidence: 95 };
    if (/family-name|last/i.test(autocomplete)) return { purpose: 'last_name', confidence: 95 };
    if (/^name$/i.test(autocomplete)) return { purpose: 'full_name', confidence: 90 };
    if (/email/i.test(autocomplete)) return { purpose: 'email', confidence: 95 };
    if (/tel/i.test(autocomplete)) return { purpose: 'phone', confidence: 95 };
    if (/address|location/i.test(autocomplete)) return { purpose: 'location', confidence: 85 };
    if (/url/i.test(autocomplete)) return { purpose: 'website', confidence: 80 };
  }

  // Check input type
  if (element instanceof HTMLInputElement) {
    if (element.type === 'email') return { purpose: 'email', confidence: 90 };
    if (element.type === 'tel') return { purpose: 'phone', confidence: 90 };
    if (element.type === 'url') return { purpose: 'website', confidence: 75 };
    if (element.type === 'file') return { purpose: 'resume', confidence: 70 };
  }

  // Check against patterns
  for (const [purpose, patterns] of Object.entries(FIELD_PATTERNS) as [FieldPurpose, RegExp[]][]) {
    if (purpose === 'unknown') continue;

    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        // SKIP: Don't fill textareas with short personal info (phone, email, name, etc.)
        // Textareas are for long-form answers like essay questions
        if (isTextarea && SHORT_FIELD_PURPOSES.includes(purpose)) {
          continue; // Skip this match, try next pattern
        }

        // Higher confidence for more specific matches
        const confidence = pattern.source.length > 10 ? 85 : 70;
        return { purpose, confidence };
      }
    }
  }

  // For textareas with long labels (essay questions), mark as unknown to skip
  if (isTextarea) {
    return { purpose: 'unknown', confidence: 0 };
  }

  return { purpose: 'unknown', confidence: 0 };
}

// Detect all fillable form fields on the page
export function detectFormFields(): FormField[] {
  const fields: FormField[] = [];
  const seenElements = new Set<Element>();

  // Find all forms first
  const forms = document.querySelectorAll('form');
  const containers = forms.length > 0 ? Array.from(forms) : [document.body];

  for (const container of containers) {
    // Query all input types we care about
    const elements = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    );

    for (const element of elements) {
      // Skip already processed or invisible elements
      if (seenElements.has(element)) continue;
      if (!isElementVisible(element)) continue;

      seenElements.add(element);

      const { purpose, confidence } = detectFieldPurpose(element);

      // Determine field type
      let type: FormField['type'] = 'text';
      if (element instanceof HTMLSelectElement) {
        type = 'select';
      } else if (element instanceof HTMLTextAreaElement) {
        type = 'textarea';
      } else if (element instanceof HTMLInputElement) {
        if (element.type === 'email') type = 'email';
        else if (element.type === 'tel') type = 'phone';
        else if (element.type === 'file') type = 'file';
      }

      // Get label text for display
      let label = '';
      const id = element.getAttribute('id');
      if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl) label = labelEl.textContent?.trim() || '';
      }
      if (!label) {
        label = element.getAttribute('placeholder') || element.getAttribute('aria-label') || '';
      }

      fields.push({
        element,
        type,
        purpose,
        label,
        confidence,
      });
    }
  }

  return fields;
}

// Check if an element is visible on the page
function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

// Get value to fill based on field purpose and resume data
function getValueForField(purpose: FieldPurpose, resume: Resume): string | null {
  const { personalInfo } = resume;
  const demographics: any = (resume as any).demographics || {}; // Handle extended types

  switch (purpose) {
    case 'first_name':
      return personalInfo.fullName.split(' ')[0] || null;
    case 'last_name':
      const parts = personalInfo.fullName.split(' ');
      return parts.length > 1 ? parts.slice(1).join(' ') : null;
    case 'full_name':
      return personalInfo.fullName || null;
    case 'email':
      return personalInfo.email || null;
    case 'phone':
      return personalInfo.phone || null;
    case 'location':
      return personalInfo.location || null;
    case 'linkedin':
      return personalInfo.linkedin || null;
    case 'website':
      return personalInfo.website || null;
    case 'github':
      return personalInfo.github || null;
    // Demographics
    case 'gender':
      return demographics.gender || null;
    case 'race':
      return demographics.race || null;
    case 'veteran':
      return demographics.veteranStatus || null;
    case 'disability':
      return demographics.disabilityStatus || null;
    case 'pronouns':
      return demographics.pronouns || null;
    case 'sexual_orientation':
      return demographics.sexualOrientation || null;
    case 'hispanic':
      return demographics.isHispanic || null;
    case 'is_lgbtq':
      return demographics.isLGBTQ || null;

    // Logistics
    case 'availability':
      return demographics.availability || null;
    case 'salary':
      return demographics.salaryExpectation || null;
    case 'relocation':
      return demographics.relocation || null;

    // Authorization
    case 'work_authorization':
      return demographics.workAuthorization || 'Yes'; // Default to yes
    case 'sponsorship':
      return demographics.requiresSponsorship ? 'Yes' : 'No';
    case 'country':
      // Try to extract country from location field (e.g., "San Francisco, CA, USA")
      const location = personalInfo.location || '';
      if (/usa|united states|u\.s\./i.test(location)) return 'United States';
      if (/india/i.test(location)) return 'India';
      if (/uk|united kingdom|england/i.test(location)) return 'United Kingdom';
      if (/canada/i.test(location)) return 'Canada';
      if (/germany/i.test(location)) return 'Germany';
      // Return location as-is if we can't extract country
      return location || null;
    case 'non_compete':
      return 'No'; // Most people don't have non-competes
    case 'referral_source':
      return demographics.referralSource || 'Job Board'; // Default to job board
    default:
      return null;
  }
}

// Sleep helper for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fill a single form field with simulated user input
async function fillSingleField(field: FormField, value: string): Promise<boolean> {
  const el = field.element;

  try {
    // Focus the element
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    if (field.type === 'select' && el instanceof HTMLSelectElement) {
      // Find matching option with multiple strategies
      const options = Array.from(el.options).filter(opt => opt.value !== ''); // Exclude empty placeholder
      const valueLower = value.toLowerCase();

      // Strategy 1: Exact match
      let matchingOption = options.find(
        opt =>
          opt.text.toLowerCase() === valueLower ||
          opt.value.toLowerCase() === valueLower
      );

      // Strategy 2: Contains match
      if (!matchingOption) {
        matchingOption = options.find(
          opt =>
            opt.text.toLowerCase().includes(valueLower) ||
            opt.value.toLowerCase().includes(valueLower) ||
            valueLower.includes(opt.text.toLowerCase())
        );
      }

      // Strategy 3: For Yes/No questions, try various affirmative/negative patterns
      if (!matchingOption) {
        if (valueLower === 'yes' || valueLower === 'true') {
          matchingOption = options.find(opt =>
            /^yes$/i.test(opt.text.trim()) ||
            /^true$/i.test(opt.value) ||
            /i (am|do|have|will)/i.test(opt.text)
          );
        } else if (valueLower === 'no' || valueLower === 'false') {
          matchingOption = options.find(opt =>
            /^no$/i.test(opt.text.trim()) ||
            /^false$/i.test(opt.value) ||
            /i (am not|do not|don't|have not|won't)/i.test(opt.text)
          );
        }
      }

      if (matchingOption) {
        el.value = matchingOption.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Also dispatch input event for React-based forms
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      // Highlight if we couldn't find a match
      console.log(`[CareerFlow] Could not find matching option for "${value}" in:`, options.map(o => o.text));
      highlightElement(el, `⚠️ Please select: ${value}`);
      return false;
    }

    if (field.type === 'file') {
      // Cannot programmatically set file inputs due to browser security
      // Click the input to open file dialog and highlight it
      highlightElement(el, '📎 Click to upload your file');
      try {
        // Try to click the file input to open the dialog
        (el as HTMLInputElement).click();
      } catch (e) {
        console.log('Could not auto-click file input:', e);
      }
      return false;
    }

    // For text inputs and textareas
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      // Clear existing value
      el.value = '';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

      // Type each character (simulates real user input)
      for (let i = 0; i < value.length; i++) {
        const char = value[i];

        // Key events
        el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));

        // Update value
        el.value = value.substring(0, i + 1);

        // Input event
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: char,
        }));

        el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

        // Small delay between characters for realism
        await sleep(15);
      }

      // Final change event
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Blur the element
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    el.blur();

    return true;
  } catch (error) {
    console.error('Error filling field:', error);
    return false;
  }
}

// Highlight an element that needs attention
function highlightElement(element: HTMLElement, message: string): void {
  element.style.outline = '3px solid #4f46e5';
  element.style.outlineOffset = '2px';

  // Add tooltip
  const tooltip = document.createElement('div');
  tooltip.textContent = message;
  tooltip.style.cssText = `
    position: absolute;
    background: #4f46e5;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    pointer-events: none;
  `;

  const rect = element.getBoundingClientRect();
  tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
  tooltip.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(tooltip);

  // Remove after 5 seconds
  setTimeout(() => {
    element.style.outline = '';
    element.style.outlineOffset = '';
    tooltip.remove();
  }, 5000);
}

// Fill all detected form fields sequentially
export async function fillFormFields(
  resume: Resume,
  onProgress?: (progress: FillProgress) => void
): Promise<{ filled: number; total: number; skipped: FieldPurpose[] }> {
  const fields = detectFormFields();

  let filled = 0;
  const skipped: FieldPurpose[] = [];

  // Filter to only fields we can fill
  const fillableFields = fields.filter(f => f.purpose !== 'unknown' && f.purpose !== 'resume' && f.purpose !== 'cover_letter');

  for (let i = 0; i < fillableFields.length; i++) {
    const field = fillableFields[i];
    const value = getValueForField(field.purpose, resume);

    let success = false;

    if (value) {
      // Scroll element into view
      field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(100);

      success = await fillSingleField(field, value);

      if (success) {
        filled++;
        // Visual feedback - brief green flash
        field.element.style.backgroundColor = '#22c55e33';
        setTimeout(() => {
          field.element.style.backgroundColor = '';
        }, 500);
      }
    } else {
      skipped.push(field.purpose);
    }

    // Report progress
    if (onProgress) {
      onProgress({
        field,
        index: i,
        total: fillableFields.length,
        success,
      });
    }

    // Delay between fields for visual effect
    await sleep(150);
  }

  // Highlight fields that need manual attention
  const manualFields = fields.filter(f => f.purpose === 'resume' || f.purpose === 'cover_letter');
  for (const field of manualFields) {
    const label = field.purpose === 'resume' ? 'Upload your resume' : 'Enter cover letter';
    highlightElement(field.element, label);
  }

  // Auto-Advance Check (Tier 3 Module)
  // If we filled data and are structurally confident, push next phase
  if (filled > 0 && fillableFields.length === filled) {
    // Optionally wait a second to make sure form validations have passed
    await sleep(800);
    // Auto click next
    await attemptAutoAdvance();
  }

  return {
    filled,
    total: fillableFields.length,
    skipped,
  };
}

// Quick fill with just personal info (no AI tailoring)
export async function quickFill(
  resume: Resume, // Changed from PersonalInfo to Resume
  onProgress?: (progress: FillProgress) => void
): Promise<{ filled: number; total: number }> {
  const fields = detectFormFields();
  let filled = 0;

  const fillableFields = fields.filter(
    f => f.purpose !== 'unknown' && f.purpose !== 'resume' && f.purpose !== 'cover_letter'
  );

  for (let i = 0; i < fillableFields.length; i++) {
    const field = fillableFields[i];
    const value = getValueForField(field.purpose, resume);

    let success = false;
    if (value) {
      field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(100);
      success = await fillSingleField(field, value);
      if (success) filled++;
    }

    if (onProgress) {
      onProgress({
        field,
        index: i,
        total: fillableFields.length,
        success,
      });
    }

    await sleep(150);
  }

  return { filled, total: fillableFields.length };
}

// Get a summary of detected fields for display
export function getFieldsSummary(): { purpose: FieldPurpose; label: string; filled: boolean }[] {
  const fields = detectFormFields();

  return fields
    .filter(f => f.purpose !== 'unknown')
    .map(f => ({
      purpose: f.purpose,
      label: f.label || f.purpose.replace(/_/g, ' '),
      filled: !!(f.element as HTMLInputElement).value,
    }));
}

// Get file upload fields that need manual attention
export function getFileUploadFields(): { purpose: FieldPurpose; label: string; element: HTMLInputElement }[] {
  const fields = detectFormFields();

  return fields
    .filter(f => f.type === 'file')
    .map(f => ({
      purpose: f.purpose,
      label: f.label || (f.purpose === 'resume' ? 'Resume/CV Upload' : 'File Upload'),
      element: f.element as HTMLInputElement,
    }));
}

// Trigger file input click for a specific field
export function triggerFileUpload(fieldPurpose: FieldPurpose): boolean {
  const fields = detectFormFields();
  const fileField = fields.find(f => f.type === 'file' && f.purpose === fieldPurpose);

  if (fileField) {
    try {
      (fileField.element as HTMLInputElement).click();
      highlightElement(fileField.element, `📎 Select your ${fieldPurpose === 'resume' ? 'resume' : 'file'}`);
      return true;
    } catch (e) {
      console.error('Failed to trigger file upload:', e);
    }
  }
  return false;
}

// Upload a file to a file input using DataTransfer API
export async function uploadFileToInput(
  base64Data: string,
  filename: string,
  mimeType: string = 'application/pdf'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find file inputs that might accept this file
    const fields = detectFormFields();
    const fileFields = fields.filter(f => f.type === 'file');

    if (fileFields.length === 0) {
      return { success: false, error: 'No file inputs found' };
    }

    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // Create a File object
    const file = new File([blob], filename, { type: mimeType });

    let uploadedCount = 0;

    // Try to upload to resume/CV file inputs first
    for (const field of fileFields) {
      const input = field.element as HTMLInputElement;

      // Check if this input accepts PDFs
      const accept = input.getAttribute('accept') || '';
      const acceptsPDF = !accept || accept.includes('pdf') || accept.includes('*') || accept.includes('application');

      if (!acceptsPDF) continue;

      // Check if it's likely a resume upload field
      const isResumeField = field.purpose === 'resume' ||
        field.label?.toLowerCase().includes('resume') ||
        field.label?.toLowerCase().includes('cv');

      // Prioritize resume fields, but try others if none found
      if (isResumeField || uploadedCount === 0) {
        try {
          // Use DataTransfer API to set the file
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;

          // Dispatch change event to trigger React/Vue handlers
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));

          // Visual feedback
          highlightElement(input, `✓ ${filename} uploaded`);
          uploadedCount++;

          console.log(`[CareerFlow] Uploaded ${filename} to file input`);

          // If this was a resume field, we're done
          if (isResumeField) break;
        } catch (e) {
          console.error('[CareerFlow] Failed to set file on input:', e);
        }
      }
    }

    if (uploadedCount > 0) {
      return { success: true };
    } else {
      return { success: false, error: 'Could not upload to any file input' };
    }
  } catch (error) {
    console.error('[CareerFlow] File upload error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Get all file inputs on the page (for resume upload)
export function getResumeFileInputs(): HTMLInputElement[] {
  const fields = detectFormFields();
  return fields
    .filter(f => f.type === 'file')
    .filter(f => {
      const input = f.element as HTMLInputElement;
      const accept = input.getAttribute('accept') || '';
      return !accept || accept.includes('pdf') || accept.includes('*');
    })
    .map(f => f.element as HTMLInputElement);
}

// ============================================
// Essay Question Detection and Filling
// ============================================

/**
 * Extract the question text from a textarea element by checking various sources
 */
function extractQuestionText(element: HTMLElement): string {
  // 1. Check aria-labelledby (most reliable for complex labels)
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) {
      const text = labelElement.textContent?.trim();
      if (text && text.length > 10) return text;
    }
  }

  // 2. Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.length > 10) {
    return ariaLabel;
  }

  // 3. Check for associated label via 'for' attribute
  const id = element.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      const text = label.textContent?.trim();
      if (text && text.length > 10) return text;
    }
  }

  // 4. Check parent/ancestor labels
  let parent = element.parentElement;
  let depth = 0;
  while (parent && depth < 5) {
    // Check for label as direct parent
    if (parent.tagName === 'LABEL') {
      const text = parent.textContent?.trim();
      if (text && text.length > 10) return text;
    }

    // Check for label-like elements (common in custom form designs)
    const labelLike = parent.querySelector('.field-label, .question-label, .form-label, [class*="label"], legend, h3, h4');
    if (labelLike) {
      const text = labelLike.textContent?.trim();
      if (text && text.length > 10) return text;
    }

    parent = parent.parentElement;
    depth++;
  }

  // 5. Check placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.length > 10) {
    return placeholder;
  }

  // 6. Check name attribute (last resort, format it nicely)
  const name = element.getAttribute('name');
  if (name) {
    return name.replace(/[_-]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
  }

  return 'Essay question';
}

/**
 * Generate a unique CSS selector for an element
 */
function generateUniqueSelector(element: HTMLElement): string {
  // 1. Try ID (most reliable)
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // 2. Try data attributes
  const dataTestId = element.getAttribute('data-testid');
  if (dataTestId) {
    return `[data-testid="${CSS.escape(dataTestId)}"]`;
  }

  const dataId = element.getAttribute('data-id');
  if (dataId) {
    return `[data-id="${CSS.escape(dataId)}"]`;
  }

  // 3. Try name attribute
  const name = element.getAttribute('name');
  if (name) {
    return `textarea[name="${CSS.escape(name)}"]`;
  }

  // 4. Build positional selector
  const tagName = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.querySelectorAll(`:scope > ${tagName}`));
    const index = siblings.indexOf(element);
    if (index !== -1) {
      const parentSelector = parent.id
        ? `#${CSS.escape(parent.id)}`
        : parent.className
          ? `.${CSS.escape(parent.className.split(' ')[0])}`
          : parent.tagName.toLowerCase();
      return `${parentSelector} > ${tagName}:nth-of-type(${index + 1})`;
    }
  }

  // 5. Fallback: use class if available
  if (element.className) {
    const firstClass = element.className.split(' ')[0];
    return `${tagName}.${CSS.escape(firstClass)}`;
  }

  return tagName;
}

/**
 * Detect essay questions (textareas with unknown purpose that look like essay prompts)
 */
export function detectEssayQuestions(): EssayQuestion[] {
  const fields = detectFormFields();
  const essayQuestions: EssayQuestion[] = [];

  const textareaFields = fields.filter(f =>
    f.type === 'textarea' &&
    f.purpose === 'unknown'
  );

  textareaFields.forEach((field, index) => {
    const element = field.element as HTMLTextAreaElement;
    const questionText = extractQuestionText(element);

    // Skip very short "questions" that are likely just labels
    if (questionText.length < 15) return;

    // Skip if it looks like a cover letter field (handled separately)
    if (/cover\s*letter/i.test(questionText)) return;

    essayQuestions.push({
      id: `essay_${index}`,
      question: questionText,
      fieldSelector: generateUniqueSelector(element),
      maxLength: element.maxLength > 0 ? element.maxLength : undefined,
      required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
    });
  });

  return essayQuestions;
}

/**
 * Fill a specific essay textarea using its selector
 */
export async function fillEssayField(selector: string, text: string): Promise<boolean> {
  try {
    const element = document.querySelector(selector) as HTMLTextAreaElement;
    if (!element) {
      console.error(`[CareerFlow] Essay field not found: ${selector}`);
      return false;
    }

    // Create a temporary FormField for fillSingleField
    const tempField: FormField = {
      element,
      type: 'textarea',
      purpose: 'unknown',
      label: 'Essay',
      confidence: 100,
    };

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    // Fill the field
    const success = await fillSingleField(tempField, text);

    if (success) {
      // Visual feedback
      element.style.backgroundColor = '#22c55e33';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 1000);
    }

    return success;
  } catch (error) {
    console.error('[CareerFlow] Error filling essay field:', error);
    return false;
  }
}

/**
 * Fill multiple essay fields from an array of responses
 */
export async function fillEssayFields(
  responses: { questionId: string; response: string; selector: string }[]
): Promise<{ filled: number; total: number }> {
  let filled = 0;
  const total = responses.length;

  for (const { selector, response } of responses) {
    const success = await fillEssayField(selector, response);
    if (success) filled++;
    await sleep(300); // Brief pause between fills
  }

  return { filled, total };
}

/**
 * Fill cover letter field if present on the page
 */
export async function fillCoverLetter(coverLetterText: string): Promise<boolean> {
  const fields = detectFormFields();

  // Find cover letter textarea field
  const coverLetterField = fields.find(f =>
    f.purpose === 'cover_letter' && f.type === 'textarea'
  );

  if (!coverLetterField) {
    // Also try to find any textarea that looks like a cover letter field
    const textareas = fields.filter(f => f.type === 'textarea');
    for (const field of textareas) {
      const labelText = (field.label || '').toLowerCase();
      if (labelText.includes('cover') || labelText.includes('letter')) {
        return await fillCoverLetterField(field.element as HTMLTextAreaElement, coverLetterText);
      }
    }
    console.log('[CareerFlow] No cover letter field found on page');
    return false;
  }

  return await fillCoverLetterField(coverLetterField.element as HTMLTextAreaElement, coverLetterText);
}

async function fillCoverLetterField(element: HTMLTextAreaElement, text: string): Promise<boolean> {
  try {
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);

    // Focus the element
    element.focus();
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    // Clear existing value
    element.value = '';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

    // Set the value directly (cover letters are too long to type character by character)
    element.value = text;

    // Dispatch events
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Blur
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    element.blur();

    // Visual feedback
    element.style.backgroundColor = '#22c55e33';
    highlightElement(element, '✓ Cover letter filled!');
    setTimeout(() => {
      element.style.backgroundColor = '';
    }, 2000);

    console.log('[CareerFlow] Cover letter filled successfully');
    return true;
  } catch (error) {
    console.error('[CareerFlow] Error filling cover letter:', error);
    return false;
  }
}

// Experimental Auto-Advance Scanner
export async function attemptAutoAdvance(): Promise<boolean> {
  // Looking for common job application advancement labels
  const advanceRegex = /(^next$|^continue$|^save.*continue$|^submit.*application$|^submit$|^apply$)/i;

  // Find all buttons or functional look-a-likes
  const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a.button, [role="button"]'));

  for (const btn of buttons) {
    const text = (btn.textContent || (btn as HTMLInputElement).value || '').trim();
    if (advanceRegex.test(text) && isElementVisible(btn as HTMLElement) && !(btn as HTMLButtonElement).disabled) {
      console.log(`[CareerFlow Auto-Advance] Clicking forward matching pattern: "${text}"`);
      (btn as HTMLElement).click();
      return true;
    }
  }

  return false;
}
