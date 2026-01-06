import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    MessageSquare,
    Mail,
    Phone,
    MapPin,
    Send,
    Loader2,
    CheckCircle2,
    ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Contact() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState({
        name: '',
        email: '',
        subject: '',
        message: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate form submission
        await new Promise(resolve => setTimeout(resolve, 1000));

        setLoading(false);
        setSubmitted(true);
        toast({
            title: 'Message Sent',
            description: "We'll get back to you within 24 hours.",
        });
    };

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
                    <MessageSquare className="h-12 w-12 mx-auto text-indigo-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Contact Us</h1>
                    <p className="text-gray-600">
                        Have questions? We're here to help. Reach out and we'll respond within 24 hours.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Contact Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Send a Message</CardTitle>
                            <CardDescription>Fill out the form and we'll get back to you</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {submitted ? (
                                <div className="text-center py-8">
                                    <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">Message Received!</h3>
                                    <p className="text-gray-600 mb-4">
                                        Thank you for contacting us. We'll respond within 24 hours.
                                    </p>
                                    <Button variant="outline" onClick={() => setSubmitted(false)}>
                                        Send Another Message
                                    </Button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <Label htmlFor="name">Full Name</Label>
                                        <Input
                                            id="name"
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            required
                                            placeholder="Your name"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            required
                                            placeholder="you@example.com"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="subject">Subject</Label>
                                        <Input
                                            id="subject"
                                            value={form.subject}
                                            onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                            required
                                            placeholder="How can we help?"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="message">Message</Label>
                                        <textarea
                                            id="message"
                                            value={form.message}
                                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                                            required
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            placeholder="Tell us more about your question..."
                                        />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={loading}>
                                        {loading ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4 mr-2" />
                                        )}
                                        Send Message
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                    {/* Contact Info */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Mail className="h-5 w-5 text-indigo-600" />
                                    Email Support
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-600 mb-2">For general inquiries and support:</p>
                                <a href="mailto:support@prism.ng" className="text-indigo-600 font-medium hover:underline">
                                    support@prism.ng
                                </a>
                                <p className="text-sm text-gray-500 mt-2">Response time: 24 hours</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Phone className="h-5 w-5 text-indigo-600" />
                                    WhatsApp
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-600 mb-2">Quick questions and support:</p>
                                <a href="https://wa.me/2348012345678" className="text-indigo-600 font-medium hover:underline">
                                    +234 801 234 5678
                                </a>
                                <p className="text-sm text-gray-500 mt-2">Available Mon-Fri, 9am-6pm WAT</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MapPin className="h-5 w-5 text-indigo-600" />
                                    Office
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-600">
                                    Lagos, Nigeria
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    In-person meetings by appointment only
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-indigo-50 border-indigo-200">
                            <CardContent className="p-4">
                                <p className="text-sm text-indigo-800">
                                    <strong>Pro Tip:</strong> For faster support, use the AI chat in your dashboard. PRISM AI can answer most questions instantly!
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
