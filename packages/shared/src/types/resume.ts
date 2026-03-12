// Resume-related types

export type SectionType = 'personal' | 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'custom';

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  isVisible: boolean;
  order: number;
}

export type SectionConfig = Section;

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  website?: string;
  linkedin?: string;
  github?: string;
  customFields?: { label: string; value: string }[];
}

export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string[];
  location?: string;
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  grade?: string;
}

export interface SkillGroup {
  id: string;
  category: string;
  items: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  link?: string;
  github?: string;
  bullets?: string[];
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  link?: string;
}

export interface LayoutSettings {
  fontFamily?: string;
  fontSize: number;
  lineHeight: number;
  sectionSpacing: number;
  nameSize?: number;
  contactSize?: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface TailoringJob {
  company: string;
  title: string;
  description: string;
  link?: string;
}

export interface Demographics {
  gender?: string;
  pronouns?: string;
  isHispanic?: string;
  race?: string;
  isLGBTQ?: string;
  sexualOrientation?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  availability?: string;
  salaryExpectation?: string;
  relocation?: string;
  workAuthorization?: string;
  requiresSponsorship?: boolean;
}

export interface Resume {
  id: string;
  title: string;
  sections: Section[];
  personalInfo: PersonalInfo;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillGroup[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  selectedTemplate?: 'modern' | 'classic' | 'minimalist' | 'jake';
  selectedFont?: 'professional' | 'modern' | 'technical';
  pageSize?: 'A4' | 'LETTER';
  layout?: LayoutSettings;
  isTailoring?: boolean;
  tailoringJob?: TailoringJob;
  originalResume?: Resume;
  demographics?: Demographics;
}

export interface UserProfile {
  id: string;
  name: string;
  masterResume: Resume;
  tailoredResumes: Resume[];
}
