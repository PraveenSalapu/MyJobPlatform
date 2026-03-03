/**
 * PDF and Preview Layout Constants
 *
 * This file ensures consistent dimensions between the HTML preview and PDF export.
 * All measurements are in millimeters (mm) for the source of truth.
 */

// Page dimensions in mm
export const PAGE_SIZES = {
    A4: {
        width: 210,
        height: 297,
    },
    LETTER: {
        width: 215.9,
        height: 279.4,
    },
} as const;

// Precise mm to pt conversion factor (1 inch = 72pt = 25.4mm)
export const MM_TO_PT = 72 / 25.4; // ~2.834645669

// Default layout settings (values in mm for margins/spacing, pt for font sizes)
export const DEFAULT_LAYOUT = {
    fontSize: 10,
    lineHeight: 1.4,
    sectionSpacing: 5, // mm
    nameSize: 24,
    contactSize: 10,
    margin: {
        top: 15, // mm
        right: 15, // mm
        bottom: 15, // mm
        left: 15, // mm
    },
    fontFamily: 'Helvetica',
} as const;

// Template-specific default overrides
export const TEMPLATE_DEFAULTS = {
    modern: {
        ...DEFAULT_LAYOUT,
        nameSize: 24,
        contactSize: 10,
        fontFamily: 'Helvetica',
    },
    classic: {
        ...DEFAULT_LAYOUT,
        nameSize: 20,
        contactSize: 9,
        fontFamily: 'Times-Roman',
    },
    minimalist: {
        ...DEFAULT_LAYOUT,
        nameSize: 20,
        contactSize: 9,
        fontFamily: 'Helvetica',
    },
} as const;

// Helper to convert mm value to pt
export const mmToPt = (mm: number): number => mm * MM_TO_PT;

// Helper to get page dimensions in a specific unit
export const getPageSize = (
    size: 'A4' | 'LETTER',
    unit: 'mm' | 'pt' = 'mm'
): { width: number; height: number } => {
    const dims = PAGE_SIZES[size];
    if (unit === 'pt') {
        return {
            width: dims.width * MM_TO_PT,
            height: dims.height * MM_TO_PT,
        };
    }
    return dims;
};

// Get CSS-ready page dimensions
export const getPageSizeCSS = (size: 'A4' | 'LETTER'): { width: string; height: string } => {
    const dims = PAGE_SIZES[size];
    return {
        width: `${dims.width}mm`,
        height: `${dims.height}mm`,
    };
};
