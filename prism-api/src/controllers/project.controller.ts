import { whatsappService } from '../services/whatsapp.service';
import { projectService, Project, CreateProjectDTO, ProjectExpenseDTO } from '../services/project.service';
import { projectExpenseValidatorService } from '../services/project-expense-validator.service';
import { conversationService } from '../services/conversation.service';
import { supabase } from '../config/database';

export interface ProjectConversationState {
    flow: 'project_creation' | 'project_expense' | 'project_receipt';
    step: string;
    data: Partial<CreateProjectDTO> | Partial<ProjectExpenseDTO> | any;
    activeProjectId?: string;
    activeProjectName?: string;
}

export class ProjectController {
    /**
     * Handle project-related text commands
     */
    async handleProjectCommand(userId: string, text: string, user: any): Promise<boolean> {
        const lowerText = text.toLowerCase().trim();
        const state = await conversationService.getState(userId);

        // Check if we're in a project flow
        if (state?.flow?.startsWith('project_')) {
            await this.handleProjectFlow(userId, text, user, state);
            return true;
        }

        // New project command
        if (lowerText === 'new project' || lowerText === 'create project') {
            await this.startProjectCreation(userId);
            return true;
        }

        // List projects
        if (lowerText === 'projects' || lowerText === 'my projects') {
            await this.listProjects(userId, user);
            return true;
        }

        // Switch to project
        if (lowerText.startsWith('project ') && !lowerText.startsWith('project expense') && !lowerText.startsWith('project balance') && !lowerText.startsWith('project summary')) {
            const projectName = lowerText.replace('project ', '').trim();
            await this.switchToProject(userId, projectName, user);
            return true;
        }

        // Project expense
        if (lowerText.startsWith('project expense ')) {
            const parts = lowerText.replace('project expense ', '').trim();
            await this.handleProjectExpense(userId, parts, user);
            return true;
        }

        // Project balance
        if (lowerText === 'project balance' || lowerText === 'balance') {
            await this.showProjectBalance(userId, user);
            return true;
        }

        // Project summary
        if (lowerText === 'project summary' || lowerText === 'summary') {
            await this.showProjectSummary(userId, user);
            return true;
        }

        // Complete project
        if (lowerText === 'complete project' || lowerText === 'close project') {
            await this.completeProject(userId, user);
            return true;
        }

        return false; // Not a project command
    }

    /**
     * Start project creation flow
     */
    private async startProjectCreation(userId: string): Promise<void> {
        await conversationService.setState(userId, {
            flow: 'project_creation',
            step: 'ask_name',
            data: {}
        });

        await whatsappService.sendMessage(userId, `📋 *Let's set up a new Project Fund*

What is the name of this project?

Example: "Uncle Ahmed's House Project"`);
    }

    /**
     * Handle ongoing project creation flow
     */
    private async handleProjectFlow(userId: string, text: string, user: any, state: any): Promise<void> {
        if (state.flow === 'project_creation') {
            await this.handleProjectCreationFlow(userId, text, user, state);
        } else if (state.flow === 'project_expense') {
            await this.handleProjectExpenseFlow(userId, text, user, state);
        }
    }

    /**
     * Handle project creation conversation steps
     */
    private async handleProjectCreationFlow(userId: string, text: string, user: any, state: any): Promise<void> {
        const data = state.data as Partial<CreateProjectDTO>;

        switch (state.step) {
            case 'ask_name':
                data.name = text.trim();
                await conversationService.updateState(userId, {
                    step: 'ask_source_person',
                    data
                });
                await whatsappService.sendMessage(userId, `Who is providing the funds?

Example: "Uncle Ahmed" or "Mrs. Fatima Bello"`);
                break;

            case 'ask_source_person':
                data.source_person = text.trim();
                await conversationService.updateState(userId, {
                    step: 'ask_relationship',
                    data
                });
                await whatsappService.sendMessage(userId, `What is their relationship to you?

• Family Member
• Business Partner
• Client
• Friend
• Other

Reply with your choice:`);
                break;

            case 'ask_relationship':
                data.source_relationship = text.toLowerCase().trim();
                await conversationService.updateState(userId, {
                    step: 'ask_budget',
                    data
                });
                await whatsappService.sendMessage(userId, `What is the total project budget?

Example: "5000000" for ₦5 million`);
                break;

            case 'ask_budget':
                const budget = parseFloat(text.replace(/[₦,\s]/g, ''));
                if (isNaN(budget) || budget <= 0) {
                    await whatsappService.sendMessage(userId, `❌ Invalid amount. Please enter a valid number.

Example: "5000000" for ₦5 million`);
                    return;
                }

                data.budget = budget;

                try {
                    const project = await projectService.createProject(user.id, data as CreateProjectDTO);
                    await conversationService.updateState(userId, {
                        activeProjectId: project.id,
                        activeProjectName: project.name
                    });
                    await conversationService.clearState(userId);

                    // Set active project context
                    await conversationService.setState(userId, {
                        flow: '',
                        step: '',
                        data: {},
                        activeProjectId: project.id,
                        activeProjectName: project.name
                    } as any);

                    await whatsappService.sendMessage(userId, `✅ *Project Created!*

📁 *${project.name}*
💰 Budget: ₦${budget.toLocaleString()}
👤 Source: ${project.source_person} (${project.source_relationship})
📊 Status: Active

⚠️ *IMPORTANT (Section 5, Tax Act 2025):*
• This ₦${budget.toLocaleString()} is NOT your income
• Expenses for this project are NOT deductible from your business
• Any EXCESS you keep IS taxable income

*Commands:*
• \`project expense [amount] [description]\` - Record spending
• \`project balance\` - Check remaining funds
• \`project summary\` - View detailed breakdown
• \`complete project\` - Finish and calculate tax`);
                } catch (error) {
                    console.error('Error creating project:', error);
                    await whatsappService.sendMessage(userId, `❌ Failed to create project. Please try again.`);
                }
                break;
        }
    }

    /**
     * Handle project expense recording
     */
    private async handleProjectExpense(userId: string, input: string, user: any): Promise<void> {
        const state = await conversationService.getState(userId);
        const activeProjectId = state?.activeProjectId;

        if (!activeProjectId) {
            const projects = await projectService.getActiveProjects(user.id);
            if (projects.length === 0) {
                await whatsappService.sendMessage(userId, `❌ You don't have any active projects.

Use \`new project\` to create one first.`);
                return;
            }

            await whatsappService.sendMessage(userId, `❌ No active project selected.

Your projects:
${projects.map(p => `• ${p.name} (₦${(p.budget - p.spent).toLocaleString()} remaining)`).join('\n')}

Reply \`project [name]\` to select one first.`);
            return;
        }

        // Parse amount and description
        const parts = input.split(' ');
        const amount = parseFloat(parts[0].replace(/[₦,]/g, ''));
        const description = parts.slice(1).join(' ');

        if (isNaN(amount) || amount <= 0) {
            await whatsappService.sendMessage(userId, `❌ Invalid amount. Format: \`project expense [amount] [description]\`

Example: \`project expense 150000 cement bags 50 units\``);
            return;
        }

        if (!description) {
            await whatsappService.sendMessage(userId, `❌ Please provide a description.

Example: \`project expense 150000 cement bags 50 units\``);
            return;
        }

        const project = await projectService.getProject(activeProjectId);
        if (!project) {
            await whatsappService.sendMessage(userId, `❌ Project not found. Please select a project first.`);
            return;
        }

        // Validate expense
        const expenseData: ProjectExpenseDTO = { amount, description };
        const validation = await projectExpenseValidatorService.validateExpenseCategory(project, expenseData);

        // Check if expense exceeds remaining budget
        const remaining = project.budget - project.spent;
        if (amount > remaining) {
            await whatsappService.sendMessage(userId, `⚠️ *Warning:* This expense (₦${amount.toLocaleString()}) exceeds your remaining project balance (₦${remaining.toLocaleString()}).

Do you want to proceed anyway?

Reply \`yes\` to confirm or \`no\` to cancel.`);

            await conversationService.setState(userId, {
                flow: 'project_expense',
                step: 'confirm_over_budget',
                data: { amount, description, projectId: activeProjectId },
                activeProjectId,
                activeProjectName: project.name
            } as any);
            return;
        }

        // If there are high-risk warnings, ask for confirmation
        if (validation.risk === 'high') {
            const warning = projectExpenseValidatorService.generateWarningMessage(validation);
            
            await whatsappService.sendMessage(userId, `${warning}

Is this expense *wholly and exclusively* for the project?

[YES - Project Related] Reply \`yes\`
[NO - Personal Expense] Reply \`no\``);

            await conversationService.setState(userId, {
                flow: 'project_expense',
                step: 'confirm_risky',
                data: { amount, description, projectId: activeProjectId, validation },
                activeProjectId,
                activeProjectName: project.name
            } as any);
            return;
        }

        // Record the expense
        await this.recordExpenseAndRespond(userId, user, project, amount, description, validation);
    }

    /**
     * Handle project expense confirmation flow
     */
    private async handleProjectExpenseFlow(userId: string, text: string, user: any, state: any): Promise<void> {
        const lowerText = text.toLowerCase().trim();
        const data = state.data;

        if (state.step === 'confirm_over_budget' || state.step === 'confirm_risky') {
            if (lowerText === 'yes' || lowerText === 'y') {
                const project = await projectService.getProject(data.projectId);
                if (project) {
                    await this.recordExpenseAndRespond(userId, user, project, data.amount, data.description, data.validation);
                }
            } else {
                await whatsappService.sendMessage(userId, `❌ Expense cancelled.`);
            }
            
            // Clear the expense flow but keep active project
            await conversationService.updateState(userId, {
                flow: '',
                step: '',
                data: {}
            });
        }
    }

    /**
     * Record expense and send response
     */
    private async recordExpenseAndRespond(
        userId: string,
        user: any,
        project: Project,
        amount: number,
        description: string,
        validation?: any
    ): Promise<void> {
        try {
            await projectService.recordProjectExpense(user.id, project.id, {
                amount,
                description
            });

            // Refresh project data to get updated spent amount
            const updatedProject = await projectService.getProject(project.id);
            const newRemaining = updatedProject ? updatedProject.budget - updatedProject.spent : 0;

            let response = `📝 *Expense Recorded*

✅ *${project.name}*

Amount: ₦${amount.toLocaleString()}
Description: ${description}

📊 *Project Balance:*
• Budget: ₦${project.budget.toLocaleString()}
• Spent: ₦${(updatedProject?.spent || 0).toLocaleString()}
• Remaining: ₦${newRemaining.toLocaleString()}`;

            if (validation?.risk === 'medium') {
                response += `\n\n⚠️ Remember to upload the receipt for Section 32 compliance.`;
            }

            response += `\n\n📸 Send a photo of the receipt to complete documentation.`;

            await whatsappService.sendMessage(userId, response);
        } catch (error) {
            console.error('Error recording expense:', error);
            await whatsappService.sendMessage(userId, `❌ Failed to record expense. Please try again.`);
        }
    }

    /**
     * List user's projects
     */
    private async listProjects(userId: string, user: any): Promise<void> {
        const projects = await projectService.getAllProjects(user.id);

        if (projects.length === 0) {
            await whatsappService.sendMessage(userId, `📋 You don't have any projects yet.

Use \`new project\` to create your first project fund.`);
            return;
        }

        const activeProjects = projects.filter(p => p.status === 'active');
        const completedProjects = projects.filter(p => p.status === 'completed');

        let message = `📋 *Your Projects*\n\n`;

        if (activeProjects.length > 0) {
            message += `*Active:*\n`;
            for (const p of activeProjects) {
                const remaining = p.budget - p.spent;
                message += `• ${p.name}\n  Budget: ₦${p.budget.toLocaleString()} | Remaining: ₦${remaining.toLocaleString()}\n`;
            }
        }

        if (completedProjects.length > 0) {
            message += `\n*Completed:*\n`;
            for (const p of completedProjects) {
                const excess = p.budget - p.spent;
                message += `• ${p.name} (Excess: ₦${excess.toLocaleString()})\n`;
            }
        }

        message += `\nReply \`project [name]\` to select a project.`;

        await whatsappService.sendMessage(userId, message);
    }

    /**
     * Switch active project
     */
    private async switchToProject(userId: string, namePart: string, user: any): Promise<void> {
        const projects = await projectService.findProjectByName(user.id, namePart);

        if (projects.length === 0) {
            await whatsappService.sendMessage(userId, `❌ No project found matching "${namePart}".

Use \`projects\` to see your list.`);
            return;
        }

        if (projects.length > 1) {
            await whatsappService.sendMessage(userId, `Multiple projects found. Please be more specific:

${projects.map(p => `• ${p.name}`).join('\n')}`);
            return;
        }

        const project = projects[0];
        await conversationService.updateState(userId, {
            activeProjectId: project.id,
            activeProjectName: project.name
        });

        const remaining = project.budget - project.spent;

        await whatsappService.sendMessage(userId, `✅ Switched to *${project.name}*

📊 Balance: ₦${remaining.toLocaleString()} remaining

Commands:
• \`project expense [amount] [description]\` - Record spending
• \`project balance\` - Check balance
• \`project summary\` - Detailed breakdown`);
    }

    /**
     * Show project balance
     */
    private async showProjectBalance(userId: string, user: any): Promise<void> {
        const state = await conversationService.getState(userId);
        const activeProjectId = state?.activeProjectId;

        if (!activeProjectId) {
            await whatsappService.sendMessage(userId, `❌ No active project. Use \`project [name]\` to select one.`);
            return;
        }

        const balance = await projectService.getProjectBalance(activeProjectId);
        if (!balance) {
            await whatsappService.sendMessage(userId, `❌ Project not found.`);
            return;
        }

        const project = await projectService.getProject(activeProjectId);

        await whatsappService.sendMessage(userId, `💰 *${project?.name || 'Project'} Balance*

• Budget: ₦${balance.budget.toLocaleString()}
• Spent: ₦${balance.spent.toLocaleString()}
• Remaining: ₦${balance.remaining.toLocaleString()}

Progress: ${Math.round((balance.spent / balance.budget) * 100)}% used`);
    }

    /**
     * Show detailed project summary
     */
    private async showProjectSummary(userId: string, user: any): Promise<void> {
        const state = await conversationService.getState(userId);
        const activeProjectId = state?.activeProjectId;

        if (!activeProjectId) {
            await whatsappService.sendMessage(userId, `❌ No active project. Use \`project [name]\` to select one.`);
            return;
        }

        const summary = await projectService.getProjectSummary(activeProjectId);
        if (!summary) {
            await whatsappService.sendMessage(userId, `❌ Could not load project summary.`);
            return;
        }

        const { project, balance_remaining, expense_count, receipt_count, verified_receipt_count } = summary;

        let message = `📊 *${project.name} Summary*

*Source:* ${project.source_person} (${project.source_relationship})
*Status:* ${project.status.toUpperCase()}

💰 *Financials:*
• Budget: ₦${project.budget.toLocaleString()}
• Spent: ₦${project.spent.toLocaleString()}
• Remaining: ₦${balance_remaining.toLocaleString()}

📝 *Records:*
• Expenses: ${expense_count}
• Receipts: ${receipt_count}
• Verified: ${verified_receipt_count}

📋 *Compliance:*
• VAT Excluded: ✓
• Agency Fund: ${project.is_agency_fund ? '✓' : '✗'}`;

        if (project.status === 'completed' && summary.taxable_excess) {
            message += `\n\n💵 *Tax Treatment:*
• Excess: ₦${summary.taxable_excess.toLocaleString()}
• Estimated Tax: ₦${summary.estimated_tax?.toLocaleString() || '0'}`;
        }

        await whatsappService.sendMessage(userId, message);
    }

    /**
     * Complete project and calculate tax
     */
    private async completeProject(userId: string, user: any): Promise<void> {
        const state = await conversationService.getState(userId);
        const activeProjectId = state?.activeProjectId;

        if (!activeProjectId) {
            await whatsappService.sendMessage(userId, `❌ No active project. Use \`project [name]\` to select one.`);
            return;
        }

        try {
            const completion = await projectService.completeProject(activeProjectId);
            const { project, total_spent, excess, is_taxable, estimated_tax, tax_rate } = completion;

            let message = `✅ *Project Completed!*

📁 *${project.name}*

*Final Summary:*
• Total Budget: ₦${project.budget.toLocaleString()}
• Total Spent: ₦${total_spent.toLocaleString()}

💰 *EXCESS: ₦${excess.toLocaleString()}*`;

            if (is_taxable && excess > 0) {
                message += `

⚠️ *TAX TREATMENT (Section 4(1)(k)):*
This ₦${excess.toLocaleString()} is your taxable income as a "Management Fee".

• Estimated Tax: ₦${estimated_tax.toLocaleString()}
• Effective Rate: ${tax_rate.toFixed(1)}%

This will be added to your annual PIT calculation.`;
            } else if (excess <= 0) {
                message += `

✓ No taxable excess - all funds were spent on the project.`;
            }

            message += `

📄 A detailed statement has been generated for your records.`;

            // Clear active project
            await conversationService.updateState(userId, {
                activeProjectId: undefined,
                activeProjectName: undefined
            });

            await whatsappService.sendMessage(userId, message);
        } catch (error: any) {
            console.error('Error completing project:', error);
            await whatsappService.sendMessage(userId, `❌ ${error.message || 'Failed to complete project.'}`);
        }
    }
}

export const projectController = new ProjectController();
