import { Request, Response } from 'express';

export const authController = {
    login: async (req: Request, res: Response) => {
        const { email, password } = req.body;
        console.log("Login attempt:", { email, password }); // DEBUG LOG

        // TODO: Replace with real DB check
        if (email === "jothamossai@gmail.com" && password === "PRISM568426#") {
            // Return a mock token
            return res.json({
                token: "mock_jwt_token_12345",
                user: {
                    id: 1,
                    name: "Jotham Ossai",
                    email: email,
                    role: "admin"
                }
            });
        }

        return res.status(401).json({ message: "Invalid credentials" });
    }
};
