declare module "@/components/ui/button" {
  export const Button: any;
}

declare module "@/components/ui/input" {
  export const Input: any;
}

declare module "@/components/ui/label" {
  export const Label: any;
}

declare module "@/components/ui/checkbox" {
  export const Checkbox: any;
}

declare module "@/context/AuthContext" {
  export const AuthProvider: any;
  export const useAuth: any;
  const AuthContext: any;
  export default AuthContext;
}

declare module "@/components/auth/AuthBranding" {
  export const AuthBranding: any;
  const AuthBrandingDefault: any;
  export default AuthBrandingDefault;
}
