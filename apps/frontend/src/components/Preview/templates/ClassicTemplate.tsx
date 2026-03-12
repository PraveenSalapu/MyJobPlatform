import { useResume } from '../../../context/ResumeContext';
import type { Resume } from '../../../types';
import { TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const ClassicTemplate = ({ resume: propResume }: { resume?: Resume }) => {
    const context = useResume();
    const resume = propResume || context.resume;

    const { personalInfo, summary, experience, education, skills, projects, certifications, layout } = resume;

    // Default values from shared constants (with web-safe font stack)
    const defaultLayout = {
        ...TEMPLATE_DEFAULTS.classic,
        fontFamily: 'Times New Roman, Times, serif'
    };

    const currentLayout = layout && typeof layout.fontSize === 'number'
        ? { ...defaultLayout, ...layout }
        : defaultLayout;

    const nameSize = currentLayout.nameSize;
    const contactSize = currentLayout.contactSize;

    const containerStyle = {
        paddingTop: `${currentLayout.margin.top}mm`,
        paddingRight: `${currentLayout.margin.right}mm`,
        paddingBottom: `${currentLayout.margin.bottom}mm`,
        paddingLeft: `${currentLayout.margin.left}mm`,
        fontSize: `${currentLayout.fontSize}pt`,
        lineHeight: currentLayout.lineHeight,
        fontFamily: currentLayout.fontFamily || 'Times New Roman, Times, serif',
    };

    const sectionStyle = {
        marginBottom: `${currentLayout.sectionSpacing}mm`,
    };

    // Get sections in the user's custom order
    const orderedSections = resume.sections
        .filter(s => s.isVisible)
        .sort((a, b) => a.order - b.order);

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'summary':
                return summary && (
                    <section key="summary" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-2 uppercase tracking-wider border-b border-black pb-1" style={{ fontSize: '1.1em' }}>
                            Summary
                        </h2>
                        <p className="text-black text-justify">{summary}</p>
                    </section>
                );

            case 'experience':
                return experience.length > 0 && (
                    <section key="experience" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-3 uppercase tracking-wider border-b border-black pb-1" style={{ fontSize: '1.1em' }}>
                            Professional Experience
                        </h2>
                        <div className="space-y-4">
                            {experience.map((exp, index) => (
                                <div key={exp.id || index}>
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <h3 className="font-bold text-black" style={{ fontSize: '1.05em' }}>{exp.company}</h3>
                                        {exp.location && <span className="text-black italic" style={{ fontSize: '0.9em' }}>{exp.location}</span>}
                                    </div>
                                    <div className="flex justify-between items-baseline mb-2">
                                        <span className="italic text-black">{exp.position}</span>
                                        <span className="text-black" style={{ fontSize: '0.9em' }}>
                                            {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                                        </span>
                                    </div>
                                    <ul className="list-disc list-outside ml-6 space-y-1">
                                        {exp.description.map((bullet, idx) => (
                                            <li key={idx} className="text-black">
                                                {bullet}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                );

            case 'education':
                return education.length > 0 && (
                    <section key="education" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-3 uppercase tracking-wider border-b border-black pb-1" style={{ fontSize: '1.1em' }}>
                            Education
                        </h2>
                        <div className="space-y-3">
                            {education.map((edu, index) => (
                                <div key={edu.id || index}>
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <h3 className="font-bold text-black" style={{ fontSize: '1.05em' }}>{edu.institution}</h3>
                                        <span className="text-black" style={{ fontSize: '0.9em' }}>
                                            {edu.startDate} – {edu.endDate}
                                        </span>
                                    </div>
                                    <div className="text-black italic">
                                        {edu.degree}, {edu.fieldOfStudy}
                                        {edu.grade && <span className="text-black font-normal"> (GPA: {edu.grade})</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                );

            case 'skills':
                return skills.length > 0 && (
                    <section key="skills" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-3 uppercase tracking-wider border-b border-black pb-1" style={{ fontSize: '1.1em' }}>
                            Skills
                        </h2>
                        <div className="space-y-1.5">
                            {skills.map((skillGroup, index) => (
                                <div key={skillGroup.id || index}>
                                    <span className="font-bold text-black">{skillGroup.category}: </span>
                                    <span className="text-black">{skillGroup.items.join(', ')}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                );

            case 'projects':
                return projects && projects.length > 0 && (
                    <section key="projects" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-3 uppercase tracking-wider border-b border-black pb-1" style={{ fontSize: '1.1em' }}>
                            Projects
                        </h2>
                        <div className="space-y-3">
                            {projects.map((project, index) => (
                                <div key={project.id || index}>
                                    <h3 className="font-bold text-black mb-1" style={{ fontSize: '1.05em' }}>{project.name}</h3>
                                    <p className="text-black mb-1">{project.description}</p>
                                    {project.technologies && project.technologies.length > 0 && (
                                        <p className="text-black italic mb-1" style={{ fontSize: '0.9em' }}>
                                            Technologies: {project.technologies.join(', ')}
                                        </p>
                                    )}
                                    {(project.link || project.github) && (
                                        <div className="text-black" style={{ fontSize: '0.9em' }}>
                                            {project.link && <span>{project.link}</span>}
                                            {project.link && project.github && <span> | </span>}
                                            {project.github && <span>{project.github}</span>}
                                        </div>
                                    )}
                                    {project.bullets && project.bullets.length > 0 && (
                                        <ul className="list-disc list-outside ml-6 mt-1 space-y-0.5">
                                            {project.bullets.map((bullet, idx) => (
                                                <li key={idx} className="text-black">
                                                    {bullet}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                );

            case 'certifications':
                return certifications && certifications.length > 0 && (
                    <section key="certifications" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-3 uppercase tracking-wider border-b border-black pb-1" style={{ fontSize: '1.1em' }}>
                            Certifications
                        </h2>
                        <div className="space-y-2">
                            {certifications.map((cert, index) => (
                                <div key={cert.id || index} className="flex justify-between items-baseline">
                                    <div>
                                        <span className="font-bold text-black">{cert.name}</span>
                                        <span className="text-black"> – {cert.issuer}</span>
                                    </div>
                                    <span className="text-black whitespace-nowrap ml-2" style={{ fontSize: '0.9em' }}>{cert.date}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                );

            default:
                return null;
        }
    };

    return (
        <div
            className="bg-white text-black font-serif shadow-lg mx-auto min-h-[297mm]"
            style={{
                width: '210mm',
                ...containerStyle
            }}
        >
            {/* CLASSIC: Centered header with double underline */}
            <header className="text-center pb-4 border-b-2 border-black" style={sectionStyle}>
                <h1 className="font-bold text-black mb-2 tracking-wide uppercase" style={{ fontSize: `${nameSize}pt`, lineHeight: 1.2, letterSpacing: '0.05em' }}>
                    {personalInfo.fullName || 'Your Name'}
                </h1>
                <div className="flex flex-wrap justify-center gap-x-2 text-black" style={{ fontSize: `${contactSize}pt` }}>
                    {personalInfo.email && <span>{personalInfo.email}</span>}
                    {personalInfo.phone && <span>| {personalInfo.phone}</span>}
                    {personalInfo.location && <span>| {personalInfo.location}</span>}
                    {personalInfo.linkedin && <span>| {personalInfo.linkedin}</span>}
                    {personalInfo.website && <span>| {personalInfo.website}</span>}
                    {personalInfo.github && <span>| {personalInfo.github}</span>}
                </div>
            </header>

            {orderedSections.map(section => renderSection(section.id))}
        </div>
    );
};