import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PrivacyPolicy() {
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
                    <Shield className="h-12 w-12 mx-auto text-indigo-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Privacy Policy</h1>
                    <p className="text-gray-600">Last updated: January 2026</p>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Information We Collect</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                When you use PRISM, we collect information to provide and improve our services:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li><strong>Account Information:</strong> Name, email address, phone number when you register</li>
                                <li><strong>Bank Transaction Data:</strong> Transaction history, amounts, descriptions, and dates from connected bank accounts via Mono</li>
                                <li><strong>Business Information:</strong> Business name, TIN, and registration details if applicable</li>
                                <li><strong>Usage Data:</strong> How you interact with PRISM, features used, and preferences</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>2. How We Use Your Information</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>We use your information to:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>Provide tax automation and compliance services</li>
                                <li>Categorize transactions and calculate tax obligations (VAT, EMTL, Income Tax)</li>
                                <li>Generate reports and insights for your tax filing</li>
                                <li>Send you reminders about tax deadlines</li>
                                <li>Improve our AI classification accuracy</li>
                                <li>Provide customer support</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>3. Data Security</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>We take data security seriously:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li><strong>Encryption:</strong> All data is encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
                                <li><strong>Bank Credentials:</strong> We never store your bank login credentials. Authentication is handled securely by Mono (CBN-licensed)</li>
                                <li><strong>Access Control:</strong> Only authorized personnel can access user data, and all access is logged</li>
                                <li><strong>Infrastructure:</strong> We use Supabase with enterprise-grade security</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>4. Data Sharing</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>We do not sell your personal data. We may share data with:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li><strong>Mono:</strong> To establish and maintain bank connections</li>
                                <li><strong>AI Providers:</strong> Transaction descriptions are processed by AI for classification (anonymized where possible)</li>
                                <li><strong>Legal Requirements:</strong> When required by Nigerian law or regulatory authorities</li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>5. Your Rights</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>Under Nigerian data protection regulations (NDPR), you have the right to:</p>
                            <ul className="list-disc pl-5 space-y-2 mt-2">
                                <li>Access your personal data</li>
                                <li>Request correction of inaccurate data</li>
                                <li>Request deletion of your data</li>
                                <li>Export your data in a portable format</li>
                                <li>Withdraw consent for data processing</li>
                            </ul>
                            <p className="mt-4">
                                To exercise these rights, contact us at <a href="mailto:privacy@prism.ng" className="text-indigo-600">privacy@prism.ng</a>
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>6. Data Retention</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>
                                We retain your data for as long as your account is active. Transaction data is kept for 7 years to comply with Nigerian tax record-keeping requirements. You can request deletion at any time, subject to legal retention requirements.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>7. Contact Us</CardTitle>
                        </CardHeader>
                        <CardContent className="prose prose-sm max-w-none text-gray-600">
                            <p>For privacy-related inquiries:</p>
                            <ul className="list-none mt-2 space-y-1">
                                <li>Email: <a href="mailto:privacy@prism.ng" className="text-indigo-600">privacy@prism.ng</a></li>
                                <li>Address: Lagos, Nigeria</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
