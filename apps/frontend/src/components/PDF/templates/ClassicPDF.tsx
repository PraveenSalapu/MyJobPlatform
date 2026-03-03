import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Resume } from '../../../types';
import { renderPDFSection } from '../SectionRenderer';
import { MM_TO_PT, TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const ClassicPDF = ({ resume }: { resume: Resume }) => {
    // Default values from shared constants
    const defaultLayout = TEMPLATE_DEFAULTS.classic;

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
            fontFamily: layout.fontFamily || 'Times-Roman', // Dynamic Font
            fontSize: baseFontSize,
            color: '#000',
            lineHeight: lineHeight,
        },
        header: {
            marginBottom: sectionGap,
            borderBottom: '2px solid #000',
            paddingBottom: 10,
            textAlign: 'center',
        },
        name: {
            fontSize: nameSize,
            fontWeight: 'bold',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: 1,
        },
        contact: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 8,
            fontSize: contactSize,
        },
        section: {
            marginBottom: sectionGap,
        },
        sectionTitle: {
            fontSize: baseFontSize + 2,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            borderBottom: '1px solid #000',
            marginBottom: 8,
            paddingBottom: 2,
        },
        experienceItem: {
            marginBottom: 10,
        },
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 2,
        },
        company: {
            fontSize: baseFontSize + 1,
            fontWeight: 'bold',
        },
        location: {
            fontSize: baseFontSize - 1,
            fontStyle: 'italic',
        },
        position: {
            fontSize: baseFontSize,
            fontStyle: 'italic',
        },
        date: {
            fontSize: baseFontSize - 1,
        },
        bullet: {
            flexDirection: 'row',
            marginBottom: 3,
        },
        bulletPoint: {
            width: 10,
            fontSize: baseFontSize,
        },
        bulletText: {
            flex: 1,
            fontSize: baseFontSize,
        },
        skillGroup: {
            flexDirection: 'row',
            marginBottom: 3,
        },
        skillCategory: {
            fontWeight: 'bold',
            marginRight: 5,
            width: 100,
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
                    {resume.personalInfo.github && <Text>| {resume.personalInfo.github}</Text>}
                </View>
            </View>

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
