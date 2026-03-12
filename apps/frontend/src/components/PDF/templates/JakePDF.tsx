import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Resume } from '../../../types';
import { renderPDFSection } from '../SectionRenderer';
import { MM_TO_PT, TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const JakePDF = ({ resume }: { resume: Resume }) => {
    const defaultLayout = TEMPLATE_DEFAULTS.jake;

    const layout = resume.layout && typeof resume.layout.fontSize === 'number'
        ? { ...defaultLayout, ...resume.layout }
        : defaultLayout;

    const marginTop = (layout.margin?.top || 12) * MM_TO_PT;
    const marginRight = (layout.margin?.right || 16) * MM_TO_PT;
    const marginBottom = (layout.margin?.bottom || 12) * MM_TO_PT;
    const marginLeft = (layout.margin?.left || 16) * MM_TO_PT;

    const baseFontSize = layout.fontSize;
    const lineHeight = layout.lineHeight;
    const sectionGap = (layout.sectionSpacing || 3) * MM_TO_PT;
    const nameSize = layout.nameSize;
    const contactSize = layout.contactSize;

    const styles = StyleSheet.create({
        page: {
            paddingTop: marginTop,
            paddingRight: marginRight,
            paddingBottom: marginBottom,
            paddingLeft: marginLeft,
            fontFamily: 'Times-Roman',
            fontSize: baseFontSize,
            color: '#000',
            lineHeight: lineHeight,
        },
        header: {
            textAlign: 'center',
            marginBottom: sectionGap,
        },
        name: {
            fontSize: nameSize,
            fontWeight: 'bold',
            letterSpacing: 0.5,
            marginBottom: 4,
            textAlign: 'center',
        },
        contactLine: {
            fontSize: contactSize,
            textAlign: 'center',
            marginBottom: 5,
        },
        headerRule: {
            borderBottom: '1.5px solid #000',
            marginTop: 4,
        },
        section: {
            marginBottom: sectionGap,
        },
        sectionTitle: {
            fontSize: baseFontSize + 1,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            borderBottom: '1.5px solid #000',
            paddingBottom: 2,
            marginBottom: 5,
        },
        experienceItem: {
            marginBottom: 7,
        },
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
        },
        company: {
            fontSize: baseFontSize,
            fontWeight: 'bold',
        },
        position: {
            fontSize: baseFontSize,
            fontStyle: 'italic',
        },
        date: {
            fontSize: baseFontSize - 1,
        },
        location: {
            fontSize: baseFontSize - 1,
            fontStyle: 'italic',
        },
        bullet: {
            flexDirection: 'row',
            marginBottom: 2,
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
            marginBottom: 2,
        },
        skillCategory: {
            fontWeight: 'bold',
            marginRight: 4,
            width: 110,
            fontSize: baseFontSize,
        },
    });

    const pageSize = resume.pageSize || 'A4';

    const contacts = [
        resume.personalInfo.phone,
        resume.personalInfo.email,
        resume.personalInfo.location,
        resume.personalInfo.linkedin,
        resume.personalInfo.github,
        resume.personalInfo.website,
    ].filter(Boolean).join(' | ');

    return (
        <Page size={pageSize} style={styles.page}>
            {/* Centered header with full-width rule */}
            <View style={styles.header}>
                <Text style={styles.name}>{resume.personalInfo.fullName}</Text>
                {contacts ? <Text style={styles.contactLine}>{contacts}</Text> : null}
                <View style={styles.headerRule} />
            </View>

            {resume.summary ? (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>SUMMARY</Text>
                    <Text>{resume.summary}</Text>
                </View>
            ) : null}

            {resume.sections
                .filter(s => s.isVisible)
                .sort((a, b) => a.order - b.order)
                .map(section => renderPDFSection(section.id, resume, styles))}
        </Page>
    );
};
