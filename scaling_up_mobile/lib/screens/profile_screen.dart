import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {},
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Profile Header
            _buildProfileHeader(),
            const SizedBox(height: 24),

            // Stats Row
            _buildStatsRow(),
            const SizedBox(height: 24),

            // Menu Items
            _buildMenuSection(),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileHeader() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            CircleAvatar(
              radius: 40,
              backgroundColor: AppTheme.primaryPurple.withValues(alpha: 0.1),
              child: const Text(
                'JD',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryPurple,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'John Doe',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'CEO, Acme Corp',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.successGreen.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'Active Member',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.successGreen,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsRow() {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            icon: Icons.event_available,
            value: '5',
            label: 'Workshops\nAttended',
            color: AppTheme.primaryBlue,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            icon: Icons.star,
            value: '92%',
            label: 'AI Readiness\nScore',
            color: AppTheme.accentOrange,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            icon: Icons.emoji_events,
            value: '3',
            label: 'Certifications\nEarned',
            color: AppTheme.successGreen,
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required IconData icon,
    required String value,
    required String label,
    required Color color,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuSection() {
    final menuItems = [
      {
        'icon': Icons.badge,
        'title': 'My Certificates',
        'subtitle': 'View and download your certificates',
      },
      {
        'icon': Icons.folder,
        'title': 'Workshop Materials',
        'subtitle': 'Access slides, workbooks, and resources',
      },
      {
        'icon': Icons.receipt_long,
        'title': 'Payment History',
        'subtitle': 'View invoices and receipts',
      },
      {
        'icon': Icons.notifications,
        'title': 'Notifications',
        'subtitle': 'Manage your notification preferences',
      },
      {
        'icon': Icons.help,
        'title': 'Help & Support',
        'subtitle': 'FAQs and contact support',
      },
      {
        'icon': Icons.logout,
        'title': 'Sign Out',
        'subtitle': 'Log out of your account',
        'isDestructive': true,
      },
    ];

    return Card(
      child: Column(
        children: menuItems.map((item) {
          final isDestructive = item['isDestructive'] == true;
          return ListTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isDestructive
                    ? AppTheme.errorRed.withValues(alpha: 0.1)
                    : AppTheme.primaryPurple.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                item['icon'] as IconData,
                color: isDestructive ? AppTheme.errorRed : AppTheme.primaryPurple,
              ),
            ),
            title: Text(
              item['title'] as String,
              style: TextStyle(
                fontWeight: FontWeight.w500,
                color: isDestructive ? AppTheme.errorRed : null,
              ),
            ),
            subtitle: Text(
              item['subtitle'] as String,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            trailing: Icon(
              Icons.chevron_right,
              color: Colors.grey.shade400,
            ),
            onTap: () {},
          );
        }).toList(),
      ),
    );
  }
}
