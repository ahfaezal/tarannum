import ManagedSettings
import ManagedSettingsUI
import UIKit

final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemMaterialDark,
            backgroundColor: .systemIndigo,
            icon: UIImage(systemName: "book.closed.fill"),
            title: ShieldConfiguration.Label(text: "Masa latihan Tarannum", color: .white),
            subtitle: ShieldConfiguration.Label(text: "Lengkapkan 60 minit latihan untuk membuka aplikasi ini.", color: .white),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Kembali", color: .systemIndigo),
            primaryButtonBackgroundColor: .white
        )
    }
}
