import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Resume } from '../../../types';
import { renderPDFSection } from '../SectionRenderer';
import { MM_TO_PT, TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const ModernPDF = ({ resume }: { resume: Resume }) => {
    // Default values from shared constants
    const defaultLayout = TEMPLATE_DEFAULTS.modern;

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

    // Section spacing in pt
    const sectionSpacingPt = (layout.sectionSpacing || 5) * MM_TO_PT;

    // Dynamic styles based on layout
    const baseFontSize = layout.fontSize;
    const nameSize = layout.nameSize;
    const contactSize = layout.contactSize;

    const styles = StyleSheet.create({
        page: {
            paddingTop: marginTop,
            paddingRight: marginRight,
            paddingBottom: marginBottom,
            paddingLeft: marginLeft,
            fontSize: baseFontSize,
            lineHeight: layout.lineHeight,
            fontFamily: layout.fontFamily || 'Helvetica',
            color: '#333',
        },
        header: {
            marginBottom: sectionSpacingPt,
            borderBottomWidth: 2,
            borderBottomColor: '#1e293b',
            borderBottomStyle: 'solid',
            paddingBottom: 10,
        },
        name: {
            fontSize: nameSize,
            fontWeight: 'bold',
            color: '#0f172a',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 6,
        },
        contact: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: contactSize,
            color: '#475569',
        },
        section: {
            marginBottom: sectionSpacingPt,
        },
        sectionTitle: {
            fontSize: baseFontSize + 2,
            fontWeight: 'bold',
            color: '#0f172a',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1,
            borderBottomWidth: 1,
            borderBottomColor: '#cbd5e1',
            borderBottomStyle: 'solid',
            paddingBottom: 2,
        },
        experienceItem: {
            marginBottom: 10,
        },
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 2,
        },
        position: {
            fontSize: baseFontSize + 1,
            fontWeight: 'bold',
            color: '#1e293b',
        },
        date: {
            fontSize: baseFontSize - 1,
            color: '#475569',
        },
        company: {
            fontSize: baseFontSize,
            fontWeight: 'bold',
            color: '#334155',
            marginBottom: 2,
        },
        location: {
            fontSize: baseFontSize - 1,
            color: '#475569',
        },
        bullet: {
            flexDirection: 'row',
            marginBottom: 2,
            paddingLeft: 5,
        },
        bulletPoint: {
            width: 10,
            fontSize: baseFontSize,
            color: '#334155',
        },
        bulletText: {
            flex: 1,
            fontSize: baseFontSize,
            color: '#334155',
        },
        skillsContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
        },
        skillGroup: {
            flexDirection: 'row',
            marginBottom: 4,
            width: '100%',
        },
        skillCategory: {
            fontWeight: 'bold',
            width: 100,
            fontSize: baseFontSize,
            color: '#1e293b',
        },
        skillList: {
            flex: 1,
            fontSize: baseFontSize,
            color: '#334155',
        },
    });

    const pageSize = resume.pageSize || 'A4';

    return (
        <Page size={pageSize} style={styles.page}>
            <View style={styles.header}>
                <Text style={styles.name}>{resume.personalInfo.fullName}</Text>
                <View style={styles.contact}>
                    {resume.personalInfo.email && <Text>{resume.personalInfo.email}</Text>}
                    {resume.personalInfo.phone && <Text>| {resume.personalInfo.phone}</Text>}
                    {resume.personalInfo.location && <Text>| {resume.personalInfo.location}</Text>}
                    {resume.personalInfo.linkedin && <Text>| {resume.personalInfo.linkedin}</Text>}
                    {resume.personalInfo.website && <Text>| {resume.personalInfo.website}</Text>}
                </View>
            </View>

            {resume.summary && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Professional Summary</Text>
                    <Text style={{ color: '#334155' }}>{resume.summary}</Text>
                </View>
            )}

            {orderedSections.map((section) => renderPDFSection(section.id, resume, styles))}
        </Page>
    );
};
