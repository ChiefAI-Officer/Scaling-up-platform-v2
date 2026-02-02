import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class WorkshopsScreen extends StatelessWidget {
  const WorkshopsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Workshops'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () {},
          ),
        ],
      ),
      body: DefaultTabController(
        length: 3,
        child: Column(
          children: [
            Container(
              color: Theme.of(context).colorScheme.surface,
              child: TabBar(
                labelColor: AppTheme.primaryPurple,
                unselectedLabelColor: Colors.grey.shade600,
                indicatorColor: AppTheme.primaryPurple,
                tabs: const [
                  Tab(text: 'Upcoming'),
                  Tab(text: 'Past'),
                  Tab(text: 'Browse'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _buildUpcomingWorkshops(),
                  _buildPastWorkshops(),
                  _buildBrowseWorkshops(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUpcomingWorkshops() {
    final workshops = [
      {
        'title': 'Scaling Up with AI Virtual Workshop',
        'coach': 'Jeff Donaldson & Lisa Foulger',
        'date': 'Feb 24, 2026',
        'time': '9:00 AM EST',
        'format': 'Virtual',
        'status': 'Registered',
      },
      {
        'title': 'Scaling Up to Finish Strong',
        'coach': 'Claire Mula & Zahir Ladhani',
        'date': 'Feb 19, 2026',
        'time': '10:00 AM EST',
        'format': 'Virtual',
        'status': 'Registered',
      },
    ];

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: workshops.length,
      itemBuilder: (context, index) {
        final workshop = workshops[index];
        return _buildWorkshopCard(
          workshop,
          isUpcoming: true,
        );
      },
    );
  }

  Widget _buildPastWorkshops() {
    final workshops = [
      {
        'title': 'AI Virtual Workshop',
        'coach': 'Juletta Broomfield',
        'date': 'Jan 20, 2026',
        'status': 'Completed',
      },
      {
        'title': 'Denver Scaling Up AI Workshop',
        'coach': 'Jeff Donaldson',
        'date': 'Jan 15, 2026',
        'status': 'Completed',
      },
      {
        'title': 'AI Virtual Workshop',
        'coach': 'Samantha Doyle',
        'date': 'Jan 7, 2026',
        'status': 'Completed',
      },
    ];

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: workshops.length,
      itemBuilder: (context, index) {
        final workshop = workshops[index];
        return _buildWorkshopCard(
          workshop,
          isUpcoming: false,
        );
      },
    );
  }

  Widget _buildBrowseWorkshops() {
    final workshops = [
      {
        'title': 'Scaling Up to Finish Strong Virtual',
        'coach': 'Rob Williams',
        'date': 'Mar 4, 2026',
        'price': 'Free',
        'format': 'Virtual',
      },
      {
        'title': 'San Diego Scaling Up AI Workshop',
        'coach': 'Lisa Foulger',
        'date': 'Mar 16, 2026',
        'price': '\$495',
        'format': 'In-Person',
      },
      {
        'title': 'Puerto Rico AI Workshop',
        'coach': 'Jeff Donaldson',
        'date': 'Mar 18, 2026',
        'price': '\$595',
        'format': 'In-Person',
      },
    ];

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: workshops.length,
      itemBuilder: (context, index) {
        final workshop = workshops[index];
        return _buildBrowseCard(workshop);
      },
    );
  }

  Widget _buildWorkshopCard(Map<String, String> workshop, {required bool isUpcoming}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    workshop['title']!,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isUpcoming
                        ? AppTheme.primaryBlue.withValues(alpha: 0.1)
                        : AppTheme.successGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    workshop['status']!,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: isUpcoming ? AppTheme.primaryBlue : AppTheme.successGreen,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.person, size: 16, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(
                  workshop['coach']!,
                  style: TextStyle(color: Colors.grey.shade700),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 16, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(
                  workshop['date']!,
                  style: TextStyle(color: Colors.grey.shade700),
                ),
                if (workshop['time'] != null) ...[
                  const SizedBox(width: 16),
                  Icon(Icons.access_time, size: 16, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    workshop['time']!,
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ],
              ],
            ),
            if (isUpcoming) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {},
                      child: const Text('View Details'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {},
                      child: const Text('Join'),
                    ),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.play_circle_outline),
                    label: const Text('View Recording'),
                  ),
                  TextButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.download),
                    label: const Text('Materials'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildBrowseCard(Map<String, String> workshop) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              workshop['title']!,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.person, size: 16, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(workshop['coach']!),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: workshop['format'] == 'Virtual'
                        ? Colors.blue.shade50
                        : Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    workshop['format']!,
                    style: TextStyle(
                      fontSize: 12,
                      color: workshop['format'] == 'Virtual'
                          ? Colors.blue.shade700
                          : Colors.orange.shade700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 16, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(workshop['date']!),
                const Spacer(),
                Text(
                  workshop['price']!,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: workshop['price'] == 'Free'
                        ? AppTheme.successGreen
                        : AppTheme.primaryPurple,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {},
                child: const Text('Register Now'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
