import { Document, Font } from '@react-pdf/renderer';
import type { Resume } from '../../types';
import { ModernPDF } from './templates/ModernPDF';
import { ClassicPDF } from './templates/ClassicPDF';
import { MinimalistPDF } from './templates/MinimalistPDF';
import { JakePDF } from './templates/JakePDF';

// Register custom fonts
Font.register({
    family: 'Inter',
    fonts: [
        { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff' }, // Regular
        { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff', fontWeight: 'bold' } // Bold
    ]
});

interface ResumePDFProps {
    resume: Resume;
}

export const ResumePDF = ({ resume }: ResumePDFProps) => {
    const renderTemplate = () => {
        switch (resume.selectedTemplate) {
            case 'classic':
                return <ClassicPDF resume={resume} />;
            case 'minimalist':
                return <MinimalistPDF resume={resume} />;
            case 'jake':
                return <JakePDF resume={resume} />;
            case 'modern':
            default:
                return <ModernPDF resume={resume} />;
        }
    };

    return (
        <Document>
            {renderTemplate()}
        </Document>
    );
};
