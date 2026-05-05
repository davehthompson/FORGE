import { Users, MapPin, DollarSign, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button, Card, CardContent, Badge, CompanyLogo } from '../ui';
import { useStore } from '../../hooks/useStore';

export function CompanySummary() {
  const { company, setStep } = useStore();

  if (!company) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <Card variant="elevated" padding="lg" className="w-full max-w-2xl">
        <CardContent>
          {/* Header with logo */}
          <div className="flex items-start gap-4 mb-6">
            <CompanyLogo
              src={company.logo}
              name={company.name}
              size={64}
            />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-ramp-slate">{company.name}</h1>
              <p className="text-ramp-sage">{company.domain}</p>
            </div>
            <Badge variant="info">{company.industry}</Badge>
          </div>

          {/* Description */}
          <p className="text-ramp-slate mb-6 leading-relaxed">
            {company.description}
          </p>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-ramp-sand rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-ramp-sage" />
                <span className="text-sm font-medium text-ramp-sage">Employees</span>
              </div>
              <p className="text-lg font-bold text-ramp-slate">{company.employeeCount}</p>
            </div>
            <div className="p-4 bg-ramp-sand rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-ramp-sage" />
                <span className="text-sm font-medium text-ramp-sage">Location</span>
              </div>
              <p className="text-lg font-bold text-ramp-slate">{company.location}</p>
            </div>
          </div>

          {/* Spending categories */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-5 h-5 text-ramp-sage" />
              <span className="text-sm font-medium text-ramp-sage">Likely Spending Categories</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {company.spendingCategories.map((category, index) => (
                <Badge key={index} variant="default">
                  {category}
                </Badge>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep('input')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              fullWidth
              onClick={() => setStep('category')}
              className="group"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              <span>Select Spending Category</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
