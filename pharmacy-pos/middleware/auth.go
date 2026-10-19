package middleware

import "github.com/rs/cors"

// Inside your middleware setup:
c := cors.New(cors.Options{
    AllowedOrigins: []string{
        "http://localhost:5173", 
        "https://your-frontend-app.vercel.app" //  We will add your Vercel URL here later
    },
    AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders: []string{"Content-Type", "Authorization"},
    AllowCredentials: true,
})

// ContextKey is a custom type for context keys to avoid collisions
type ContextKey string
const UserContextKey ContextKey = "user"

// UserClaims holds the data we extract from the JWT
type UserClaims struct {
	UserID string
	Role   string
	Method string
}

// AuthMiddleware validates the JWT token in the Authorization header
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing authorization header", http.StatusUnauthorized)
			return
		}

		// Expect format: "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]
		claims := jwt.MapClaims{}

		// Parse and validate the token (using the same secret from handlers)
		// Note: In a real app, move jwtSecret to a shared config package
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte("super_secret_key_change_in_production"), nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Extract claims and inject into request context
		user := UserClaims{
			UserID: claims["user_id"].(string),
			Role:   claims["role"].(string),
			Method: claims["method"].(string),
		}
		
		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole checks if the authenticated user has one of the allowed roles
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := r.Context().Value(UserContextKey).(UserClaims)
			if !ok {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			for _, role := range allowedRoles {
				if user.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, "Forbidden: Insufficient permissions", http.StatusForbidden)
		})
	}
}

// GetUserFromContext is a helper for handlers to get the logged-in user's details
func GetUserFromContext(ctx context.Context) (UserClaims, bool) {
	user, ok := ctx.Value(UserContextKey).(UserClaims)
	return user, ok
}