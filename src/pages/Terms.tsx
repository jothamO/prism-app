import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Terms() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Link to="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                                <span className="text-white font-bold">P</span>
                            </div>
                            <span className="text-xl font-bold">PRISM</span>
                        </Link>
                        <Link to="/">
                            <Button variant="outline">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="text-center mb-12">
                    <FileText className="h-12 w-12 mx-auto text-indigo-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Terms of Service</h1>
                    <p className="text-gray-600">Last updated: January 2026</p>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Acceptance of Terms</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                By accessing or using PRISM ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>2. Description of Service</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                PRISM is a tax automation platform that helps users in Nigeria manage their tax obligations. The Service includes:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>Bank account connection and transaction synchronization</li>
                                <li>AI-powered transaction categorization</li>
                                <li>Tax calculation (VAT, EMTL, Income Tax)</li>
                                <li>Report generation for tax filing</li>
                                <li>Tax deadline reminders</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>3. User Responsibilities</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>You agree to:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>Provide accurate and complete information during registration</li>
                                <li>Keep your account credentials secure</li>
                                <li>Review and verify all tax calculations and reports before filing</li>
                                <li>Comply with all applicable Nigerian tax laws</li>
                                <li>Not use the Service for any illegal purposes</li>
                                <li>Not attempt to reverse engineer or compromise the Service</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>4. Tax Advice Disclaimer</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                <strong>PRISM is not a substitute for professional tax advice.</strong> The Service provides automated calculations and insights based on the information you provide and the Nigeria Tax Act 2025. However:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>You are responsible for verifying all tax calculations</li>
                                <li>Complex tax matters should be reviewed by a qualified tax professional</li>
                                <li>We do not guarantee the accuracy of AI categorizations</li>
                                <li>Final tax filing responsibility rests with you</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>5. Limitation of Liability</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                To the maximum extent permitted by law:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>PRISM is provided "as is" without warranties of any kind</li>
                                <li>We are not liable for any indirect, incidental, or consequential damages</li>
                                <li>Our total liability shall not exceed the fees you paid in the last 12 months</li>
                                <li>We are not responsible for penalties arising from incorrect tax filings</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>6. Account Termination</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                We may suspend or terminate your account if you:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>Violate these Terms of Service</li>
                                <li>Engage in fraudulent or illegal activity</li>
                                <li>Fail to pay for premium services</li>
                                <li>Attempt to abuse or exploit the platform</li>
                            </ul>
                            <p className="mt-4">
                                You may close your account at any time from your Settings page.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>7. Changes to Terms</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                We may update these Terms from time to time. We will notify you of significant changes via email or through the Service. Continued use after changes constitutes acceptance of the new terms.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>8. Governing Law</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in the courts of Lagos State.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>9. Contact</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>For questions about these Terms:</p>
                            <ul className="list-none mt-2 space-y-1">
                                <li>Email: <a href="mailto:legal@prism.ng" className="text-indigo-600">legal@prism.ng</a></li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
