import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Resume } from '../../../types';
import { renderPDFSection } from '../SectionRenderer';
import { MM_TO_PT, TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const MinimalistPDF = ({ resume }: { resume: Resume }) => {
    // Default values from shared constants
    const defaultLayout = TEMPLATE_DEFAULTS.minimalist;

    const layout = resume.layout && typeof resume.layout.fontSize === 'number'
        ? { ...defaultLayout, ...resume.layout }
        : defaultLayout;

    // Get sections in the user's custom order
    const orderedSections = resume.sections
        .filter(s => s.isVisible)
        .sort((a, b) => a.order - b.order);

    // Convert mm to pt for margins using precise conversion
    const marginTop = (layout.margin?.top || 15) * MM_TO_PT;
    const marginRight = (layout.margin?.right || 15) * MM_TO_PT;
    const marginBottom = (layout.margin?.bottom || 15) * MM_TO_PT;
    const marginLeft = (layout.margin?.left || 15) * MM_TO_PT;

    const baseFontSize = layout.fontSize;
    const lineHeight = layout.lineHeight;
    const sectionGap = (layout.sectionSpacing || 5) * MM_TO_PT;
    const nameSize = layout.nameSize;
    const contactSize = layout.contactSize;

    const styles = StyleSheet.create({
        page: {
            paddingTop: marginTop,
            paddingRight: marginRight,
            paddingBottom: marginBottom,
            paddingLeft: marginLeft,
            fontFamily: layout.fontFamily || 'Helvetica',
            fontSize: baseFontSize,
            color: '#000',
            lineHeight: lineHeight,
        },
        header: {
            marginBottom: sectionGap,
            borderBottom: '1px solid #000',
            paddingBottom: 10,
        },
        name: {
            fontSize: nameSize,
            fontWeight: 'normal',
            color: '#000',
            marginBottom: 6,
        },
        contactItem: {
            fontSize: contactSize,
            color: '#000',
            marginBottom: 2,
        },
        section: {
            marginBottom: sectionGap,
        },
        sectionTitle: {
            fontSize: baseFontSize + 1,
            fontWeight: 'bold',
            color: '#000',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
        },
        experienceItem: {
            marginBottom: 10,
        },
        // Mapped for SectionRenderer compatibility
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 2,
        },
        position: {
            fontSize: baseFontSize + 1,
            fontWeight: 'bold',
            color: '#000',
        },
        date: {
            fontSize: baseFontSize - 1,
            color: '#000',
        },
        company: {
            fontSize: baseFontSize,
            fontWeight: 'bold',
            color: '#000',
            marginBottom: 4,
        },
        location: {
            fontSize: baseFontSize - 1,
            color: '#000',
        },
        bullet: {
            flexDirection: 'row',
            marginBottom: 2,
            paddingLeft: 10,
        },
        bulletPoint: {
            width: 10,
            fontSize: baseFontSize,
            color: '#000',
        },
        bulletText: {
            fontSize: baseFontSize,
            color: '#000',
            flex: 1,
        },
        skillGroup: {
            flexDirection: 'row',
            marginBottom: 3,
        },
        skillCategory: {
            fontWeight: 'bold',
            width: 100,
            fontSize: baseFontSize,
            color: '#000',
        },
        skillList: {
            flex: 1,
            fontSize: baseFontSize,
            color: '#000',
        },
    });

    const pageSize = resume.pageSize || 'A4';

    return (
        <Page size={pageSize} style={styles.page}>
            {/* Header - ATS Optimized: Single Column */}
            <View style={styles.header}>
                <Text style={styles.name}>{resume.personalInfo.fullName}</Text>
                <View>
                    {resume.personalInfo.email && <Text style={styles.contactItem}>{resume.personalInfo.email}</Text>}
                    {resume.personalInfo.phone && <Text style={styles.contactItem}>{resume.personalInfo.phone}</Text>}
                    {resume.personalInfo.location && <Text style={styles.contactItem}>{resume.personalInfo.location}</Text>}
                    {resume.personalInfo.linkedin && <Text style={styles.contactItem}>{resume.personalInfo.linkedin}</Text>}
                    {resume.personalInfo.website && <Text style={styles.contactItem}>{resume.personalInfo.website}</Text>}
                    {resume.personalInfo.github && <Text style={styles.contactItem}>{resume.personalInfo.github}</Text>}
                </View>
            </View>

            {/* Summary - ATS Optimized */}
            {resume.summary && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>PROFESSIONAL SUMMARY</Text>
                    <Text>{resume.summary}</Text>
                </View>
            )}

            {orderedSections.map((section) => renderPDFSection(section.id, resume, styles))}
        </Page>
    );
};
