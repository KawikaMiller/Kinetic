export const APP_NAME = 'Kinetic';

/** The document title for a page: "Binary Search · Kinetic", or just the app name for home. */
export const pageTitle = (page: string | null) => (page ? `${page} · ${APP_NAME}` : APP_NAME);
