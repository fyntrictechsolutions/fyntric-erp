export type Theme = "light" | "dark";

/** localStorage key that remembers the visitor's chosen theme. */
export const THEME_STORAGE_KEY = "fyntric-theme";

/** The site loads in this theme unless the visitor picked another one. */
export const DEFAULT_THEME: Theme = "light";

/**
 * Runs in <head> before the first paint so a saved dark preference
 * is applied without a flash of the light theme.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
