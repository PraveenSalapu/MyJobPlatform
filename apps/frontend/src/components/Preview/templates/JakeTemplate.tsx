import { useResume } from '../../../context/ResumeContext';
import type { Resume } from '../../../types';
import { TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const JakeTemplate = ({ resume: propResume }: { resume?: Resume }) => {
    const context = useResume();
    const resume = propResume || context.resume;

    const { personalInfo, summary, experience, education, skills, projects, certifications, layout } = resume;

    const defaultLayout = {
        ...TEMPLATE_DEFAULTS.jake,
        fontFamily: '"Times New Roman", Times, Georgia, serif',
    };

    const currentLayout = layout && typeof layout.fontSize === 'number'
        ? { ...defaultLayout, ...layout }
        : defaultLayout;

    const containerStyle = {
        paddingTop: `${currentLayout.margin.top}mm`,
        paddingRight: `${currentLayout.margin.right}mm`,
        paddingBottom: `${currentLayout.margin.bottom}mm`,
        paddingLeft: `${currentLayout.margin.left}mm`,
        fontSize: `${currentLayout.fontSize}pt`,
        lineHeight: currentLayout.lineHeight,
        fontFamily: currentLayout.fontFamily,
    };

    const sectionGap = `${currentLayout.sectionSpacing}mm`;

    const orderedSections = resume.sections
        .filter(s => s.isVisible)
        .sort((a, b) => a.order - b.order);

    const SectionHeader = ({ title }: { title: string }) => (
        <div style={{
            fontWeight: 'bold',
            fontSize: `${currentLayout.fontSize + 1}pt`,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.08em',
            borderBottom: '1.5px solid #000',
            paddingBottom: '2px',
            marginBottom: '6px',
            marginTop: sectionGap,
        }}>
            {title}
        </div>
    );

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case 'summary':
                return summary ? (
                    <section key="summary">
                        <SectionHeader title="Summary" />
                        <p style={{ margin: 0, marginBottom: sectionGap }}>{summary}</p>
                    </section>
                ) : null;

            case 'education':
                return education.length > 0 ? (
                    <section key="education">
                        <SectionHeader title="Education" />
                        <div style={{ marginBottom: sectionGap }}>
                            {education.map((edu, i) => (
                                <div key={edu.id || i} style={{ marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontWeight: 'bold' }}>{edu.institution}</span>
                                        <span style={{ fontSize: `${currentLayout.fontSize - 1}pt` }}>
                                            {edu.startDate} – {edu.endDate}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ fontStyle: 'italic' }}>
                                            {edu.degree} in {edu.fieldOfStudy}
                                            {edu.grade ? `, GPA: ${edu.grade}` : ''}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;

            case 'experience':
                return experience.length > 0 ? (
                    <section key="experience">
                        <SectionHeader title="Experience" />
                        <div style={{ marginBottom: sectionGap }}>
                            {experience.map((exp, i) => (
                                <div key={exp.id || i} style={{ marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span style={{ fontWeight: 'bold' }}>{exp.position}</span>
                                        <span style={{ fontSize: `${currentLayout.fontSize - 1}pt` }}>
                                            {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                                        <span style={{ fontStyle: 'italic' }}>{exp.company}</span>
                                        {exp.location && (
                                            <span style={{ fontStyle: 'italic', fontSize: `${currentLayout.fontSize - 1}pt` }}>{exp.location}</span>
                                        )}
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '18px', listStyleType: 'disc' }}>
                                        {exp.description.map((bullet, idx) => (
                                            <li key={idx} style={{ marginBottom: '1px' }}>{bullet}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;

            case 'projects':
                return projects && projects.length > 0 ? (
                    <section key="projects">
                        <SectionHeader title="Projects" />
                        <div style={{ marginBottom: sectionGap }}>
                            {projects.map((project, i) => (
                                <div key={project.id || i} style={{ marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span>
                                            <span style={{ fontWeight: 'bold' }}>{project.name}</span>
                                            {project.technologies && project.technologies.length > 0 && (
                                                <span style={{ fontStyle: 'italic', fontWeight: 'normal' }}>
                                                    {' | '}{project.technologies.join(', ')}
                                                </span>
                                            )}
                                        </span>
                                        {(project.link || project.github) && (
                                            <span style={{ fontSize: `${currentLayout.fontSize - 1}pt` }}>
                                                {project.github || project.link}
                                            </span>
                                        )}
                                    </div>
                                    {project.description && (
                                        <p style={{ margin: '2px 0' }}>{project.description}</p>
                                    )}
                                    {project.bullets && project.bullets.length > 0 && (
                                        <ul style={{ margin: 0, paddingLeft: '18px', listStyleType: 'disc' }}>
                                            {project.bullets.map((b, idx) => (
                                                <li key={idx} style={{ marginBottom: '1px' }}>{b}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;

            case 'skills':
                return skills.length > 0 ? (
                    <section key="skills">
                        <SectionHeader title="Technical Skills" />
                        <div style={{ marginBottom: sectionGap }}>
                            {skills.map((group, i) => (
                                <div key={group.id || i} style={{ marginBottom: '2px' }}>
                                    <span style={{ fontWeight: 'bold' }}>{group.category}: </span>
                                    <span>{group.items.join(', ')}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;

            case 'certifications':
                return certifications && certifications.length > 0 ? (
                    <section key="certifications">
                        <SectionHeader title="Certifications" />
                        <div style={{ marginBottom: sectionGap }}>
                            {certifications.map((cert, i) => (
                                <div key={cert.id || i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span>
                                        <span style={{ fontWeight: 'bold' }}>{cert.name}</span>
                                        {cert.issuer && <span style={{ fontStyle: 'italic' }}> – {cert.issuer}</span>}
                                    </span>
                                    <span style={{ fontSize: `${currentLayout.fontSize - 1}pt` }}>{cert.date}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null;

            default:
                return null;
        }
    };

    const contacts = [
        personalInfo.phone,
        personalInfo.email,
        personalInfo.location,
        personalInfo.linkedin,
        personalInfo.github,
        personalInfo.website,
    ].filter(Boolean);

    return (
        <div
            className="bg-white text-black shadow-lg mx-auto min-h-[297mm]"
            style={{ width: '210mm', ...containerStyle }}
        >
            {/* JAKE: Centered name + single-line contact + full-width rule */}
            <header style={{ textAlign: 'center', marginBottom: sectionGap }}>
                <div style={{
                    fontSize: `${currentLayout.nameSize}pt`,
                    fontWeight: 'bold',
                    letterSpacing: '0.04em',
                    marginBottom: '4px',
                }}>
                    {personalInfo.fullName || 'Your Name'}
                </div>
                <div style={{ fontSize: `${currentLayout.contactSize}pt`, color: '#222' }}>
                    {contacts.join(' | ')}
                </div>
                <div style={{ borderBottom: '1.5px solid #000', marginTop: '6px' }} />
            </header>

            {orderedSections.map(section => renderSection(section.id))}
        </div>
    );
};
