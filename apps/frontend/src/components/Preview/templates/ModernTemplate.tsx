import { useResume } from '../../../context/ResumeContext';
import type { Resume } from '../../../types';
import { TEMPLATE_DEFAULTS } from '../../../utils/pdfConstants';

export const ModernTemplate = ({ resume: propResume }: { resume?: Resume }) => {
    const context = useResume();
    const resume = propResume || context.resume;

    const { personalInfo, summary, experience, education, skills, projects, certifications, layout } = resume;

    // Default values from shared constants (with web-safe font stack)
    const defaultLayout = {
        ...TEMPLATE_DEFAULTS.modern,
        fontFamily: 'Helvetica, Arial, sans-serif'
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
        fontFamily: currentLayout.fontFamily || 'Helvetica, Arial, sans-serif', // Dynamic Font Support
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
                        <div className="border-l-4 border-black pl-4 py-1">
                            <p className="text-black">{summary}</p>
                        </div>
                    </section>
                );
            
            case 'experience':
                return experience.length > 0 && (
                    <section key="experience" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-4 tracking-tight border-b border-gray-300 pb-1" style={{ fontSize: '1.2em' }}>EXPERIENCE</h2>
                        <div className="space-y-4">
                            {experience.map((exp, index) => (
                                <div key={exp.id || index} className="pl-4 border-l-2 border-gray-300">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className="font-bold text-black" style={{ fontSize: '1.1em' }}>{exp.position}</h3>
                                        <span className="text-gray-600 whitespace-nowrap ml-2" style={{ fontSize: '0.9em' }}>
                                            {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-baseline mb-2">
                                        <span className="font-semibold text-black">{exp.company}</span>
                                        {exp.location && <span className="text-gray-600" style={{ fontSize: '0.9em' }}>{exp.location}</span>}
                                    </div>
                                    <ul className="list-disc list-outside ml-5 space-y-1">
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
                        <h2 className="font-bold text-black mb-4 tracking-tight border-b border-gray-300 pb-1" style={{ fontSize: '1.2em' }}>EDUCATION</h2>
                        <div className="space-y-3">
                            {education.map((edu, index) => (
                                <div key={edu.id || index}>
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className="font-bold text-black" style={{ fontSize: '1.1em' }}>{edu.institution}</h3>
                                        <span className="text-gray-600 whitespace-nowrap" style={{ fontSize: '0.9em' }}>
                                            {edu.startDate} – {edu.endDate}
                                        </span>
                                    </div>
                                    <div className="text-black">
                                        {edu.degree} in {edu.fieldOfStudy}
                                        {edu.grade && <span className="text-gray-600"> • GPA: {edu.grade}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                );

            case 'skills':
                return skills.length > 0 && (
                    <section key="skills" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-4 tracking-tight border-b border-gray-300 pb-1" style={{ fontSize: '1.2em' }}>SKILLS</h2>
                        <div className="space-y-2">
                            {skills.map((skillGroup, index) => (
                                <div key={skillGroup.id || index}>
                                    <span className="font-bold text-black">{skillGroup.category}: </span>
                                    <span className="text-black">{skillGroup.items.join(' • ')}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                );

            case 'projects':
                return projects && projects.length > 0 && (
                    <section key="projects" style={sectionStyle}>
                        <h2 className="font-bold text-black mb-4 tracking-tight border-b border-gray-300 pb-1" style={{ fontSize: '1.2em' }}>PROJECTS</h2>
                        <div className="space-y-3">
                            {projects.map((project, index) => (
                                <div key={project.id || index}>
                                    <h3 className="font-bold text-black mb-1" style={{ fontSize: '1.1em' }}>{project.name}</h3>
                                    <p className="text-black mb-1">{project.description}</p>
                                    {project.technologies && project.technologies.length > 0 && (
                                        <p className="text-gray-600 mb-1" style={{ fontSize: '0.9em' }}>
                                            {project.technologies.join(' • ')}
                                        </p>
                                    )}
                                    {(project.link || project.github) && (
                                        <div className="text-gray-600" style={{ fontSize: '0.9em' }}>
                                            {project.link && <span>{project.link}</span>}
                                            {project.link && project.github && <span> • </span>}
                                            {project.github && <span>{project.github}</span>}
                                        </div>
                                    )}
                                    {project.bullets && project.bullets.length > 0 && (
                                        <ul className="list-disc list-outside ml-5 mt-1 space-y-0.5">
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
                        <h2 className="font-bold text-black mb-4 tracking-tight border-b border-gray-300 pb-1" style={{ fontSize: '1.2em' }}>CERTIFICATIONS</h2>
                        <div className="space-y-2">
                            {certifications.map((cert, index) => (
                                <div key={cert.id || index}>
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="font-bold text-black" style={{ fontSize: '1.1em' }}>{cert.name}</h3>
                                        <span className="text-gray-600 whitespace-nowrap" style={{ fontSize: '0.9em' }}>{cert.date}</span>
                                    </div>
                                    <div className="text-black">
                                        {cert.issuer}
                                        {cert.link && <span className="text-gray-600 ml-2" style={{ fontSize: '0.9em' }}>• {cert.link}</span>}
                                    </div>
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
            className="bg-white text-gray-800 shadow-lg mx-auto min-h-[297mm]"
            style={{
                width: '210mm',
                ...containerStyle
            }}
        >
            {/* MODERN: Bold Name with thick accent line */}
            <header style={sectionStyle} className="pb-4 border-b-2 border-black">
                <h1 className="font-extrabold text-black mb-2 tracking-tight uppercase" style={{ fontSize: `${nameSize}pt`, lineHeight: 1.2, letterSpacing: '0.05em' }}>
                    {personalInfo.fullName || 'Your Name'}
                </h1>
                <div className="flex flex-wrap gap-x-2.5 text-gray-700" style={{ fontSize: `${contactSize}pt` }}>
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