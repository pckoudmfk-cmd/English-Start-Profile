import { api } from "./client";

export interface AcademicYear {
  id: string;
  name: string;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  academicYearId: string;
  academicYear: AcademicYear;
  createdAt: string;
}

export interface JoinCode {
  code: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  specialty: string | null;
  status: "ACTIVE" | "ARCHIVED";
  courseId: string;
  course?: { id: string; name: string; academicYear: AcademicYear };
  joinCode: JoinCode | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherProfile {
  fullName: string | null;
  organization: string | null;
  department: string | null;
  position: string | null;
  workEmail: string | null;
}

export const workspaceApi = {
  getProfile: () => api.get<TeacherProfile | null>("/api/teacher/profile"),
  listAcademicYears: () => api.get<AcademicYear[]>("/api/teacher/academic-years"),
  createAcademicYear: (name: string) => api.post<AcademicYear>("/api/teacher/academic-years", { name }),

  listCourses: (academicYearId?: string) =>
    api.get<Course[]>(`/api/teacher/courses${academicYearId ? `?academicYearId=${academicYearId}` : ""}`),
  createCourse: (data: { name: string; academicYearId: string }) => api.post<Course>("/api/teacher/courses", data),

  listGroups: (params?: { courseId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.courseId) qs.set("courseId", params.courseId);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<Group[]>(`/api/teacher/groups${suffix}`);
  },
  getGroup: (id: string) => api.get<Group>(`/api/teacher/groups/${id}`),
  createGroup: (data: { name: string; courseId: string; specialty?: string }) =>
    api.post<Group>("/api/teacher/groups", data),
  renameGroup: (id: string, name: string) => api.put<Group>(`/api/teacher/groups/${id}`, { name }),
  archiveGroup: (id: string) => api.post<Group>(`/api/teacher/groups/${id}/archive`),
  unarchiveGroup: (id: string) => api.post<Group>(`/api/teacher/groups/${id}/unarchive`),
  regenerateJoinCode: (id: string) => api.post<Group>(`/api/teacher/groups/${id}/join-code/regenerate`),
  deactivateJoinCode: (id: string) => api.post<Group>(`/api/teacher/groups/${id}/join-code/deactivate`),
};
